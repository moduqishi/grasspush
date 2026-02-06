import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { channels } from "@/lib/db/schema/channels"
import { fetchViaHttpProxy } from "@/lib/http-proxy"

export const runtime = "edge"

const SUPPORTED_MEDIA_TYPES = ["image", "voice", "video", "file"] as const

type SupportedMediaType = typeof SUPPORTED_MEDIA_TYPES[number]

type WecomApiResponse = {
  errcode?: number
  errmsg?: string
  access_token?: string
  media_id?: string
  type?: string
  created_at?: string
}

function isSupportedMediaType(v: string): v is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(v)
}

function ensureWecomSuccess<T extends WecomApiResponse>(data: T, action: string): T {
  if (data.errcode !== 0) {
    throw new Error(`${action} failed: ${data.errmsg || "unknown error"}`)
  }
  return data
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function requestRelay<T = WecomApiResponse>(relayProxy: string, payload: Record<string, unknown>): Promise<T> {
  const relayUrl = relayProxy.replace("relay://", "https://")
  const relayResponse = await fetch(relayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const relayData = await relayResponse.json() as T
  if (!relayResponse.ok) {
    const message = (relayData as WecomApiResponse)?.errmsg || (relayData as any)?.error || "Relay request failed"
    throw new Error(`Relay error: ${message}`)
  }

  return relayData
}

async function getAccessToken(corpId: string, secret: string, proxy?: string): Promise<string> {
  const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`

  let tokenData: WecomApiResponse
  if (!proxy) {
    const tokenResponse = await fetch(tokenUrl)
    tokenData = await tokenResponse.json() as WecomApiResponse
    if (!tokenResponse.ok) {
      throw new Error(`get access_token failed: ${tokenData.errmsg || "unknown error"}`)
    }
  } else if (proxy.startsWith("relay://")) {
    tokenData = await requestRelay<WecomApiResponse>(proxy, {
      targetUrl: tokenUrl,
      method: "GET",
    })
  } else {
    const tokenResponse = await fetchViaHttpProxy(proxy, tokenUrl)
    tokenData = await tokenResponse.json() as WecomApiResponse
    if (!tokenResponse.ok) {
      throw new Error(`get access_token via proxy failed: ${tokenData.errmsg || "unknown error"}`)
    }
  }

  ensureWecomSuccess(tokenData, "get access_token")
  if (!tokenData.access_token) {
    throw new Error("get access_token failed: empty access_token")
  }

  return tokenData.access_token
}

async function uploadMedia(
  mediaType: SupportedMediaType,
  accessToken: string,
  file: File,
  proxy?: string
): Promise<WecomApiResponse> {
  const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(accessToken)}&type=${mediaType}`

  if (!proxy) {
    const uploadForm = new FormData()
    uploadForm.append("media", file, file.name)

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: uploadForm,
    })

    const uploadData = await uploadResponse.json() as WecomApiResponse
    if (!uploadResponse.ok) {
      throw new Error(`upload media failed: ${uploadData.errmsg || "unknown error"}`)
    }
    return uploadData
  }

  if (proxy.startsWith("relay://")) {
    const fileBytes = new Uint8Array(await file.arrayBuffer())
    const contentBase64 = toBase64(fileBytes)

    return requestRelay<WecomApiResponse>(proxy, {
      targetUrl: uploadUrl,
      method: "POST",
      multipart: {
        fieldName: "media",
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        contentBase64,
      },
    })
  }

  const boundary = `----GrassPushBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  const encoder = new TextEncoder()
  const header = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="${file.name}"\r\n` +
    `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`
  )
  const fileBytes = new Uint8Array(await file.arrayBuffer())
  const footer = encoder.encode(`\r\n--${boundary}--\r\n`)
  const multipartBody = concatBytes([header, fileBytes, footer])

  const proxyResponse = await fetchViaHttpProxy(proxy, uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBody,
  })

  const proxyData = await proxyResponse.json() as WecomApiResponse
  if (!proxyResponse.ok) {
    throw new Error(`upload media via proxy failed: ${proxyData.errmsg || "unknown error"}`)
  }

  return proxyData
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const channelId = formData.get("channelId")
    const mediaType = formData.get("mediaType")
    const file = formData.get("file")

    if (typeof channelId !== "string" || !channelId.trim()) {
      return NextResponse.json({ message: "Missing channelId" }, { status: 400 })
    }

    if (typeof mediaType !== "string" || !isSupportedMediaType(mediaType)) {
      return NextResponse.json({ message: "Unsupported mediaType" }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Missing upload file" }, { status: 400 })
    }

    const db = await getDb()
    const channel = await db.query.channels.findFirst({
      where: and(
        eq(channels.id, channelId),
        eq(channels.userId, session.user.id),
        eq(channels.type, "wecom_app")
      )
    })

    if (!channel) {
      return NextResponse.json({ message: "Channel not found or no permission" }, { status: 404 })
    }

    if (!channel.corpId || !channel.secret) {
      return NextResponse.json({ message: "Missing corpId/secret in channel config" }, { status: 400 })
    }

    const accessToken = await getAccessToken(channel.corpId, channel.secret, channel.socks5Proxy || undefined)
    const uploadData = await uploadMedia(mediaType, accessToken, file, channel.socks5Proxy || undefined)

    ensureWecomSuccess(uploadData, "upload media")
    if (!uploadData.media_id) {
      return NextResponse.json({ message: "Upload failed: media_id is empty" }, { status: 400 })
    }

    return NextResponse.json({
      media_id: uploadData.media_id,
      type: uploadData.type,
      created_at: uploadData.created_at,
    })
  } catch (error) {
    console.error("[WECOM_MEDIA_UPLOAD]", error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    )
  }
}