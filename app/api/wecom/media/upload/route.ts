import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { channels } from "@/lib/db/schema/channels"

export const runtime = "edge"

const SUPPORTED_MEDIA_TYPES = ["image", "voice", "video", "file"] as const

type SupportedMediaType = typeof SUPPORTED_MEDIA_TYPES[number]

function isSupportedMediaType(v: string): v is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(v)
}

async function getAccessToken(corpId: string, secret: string): Promise<string> {
  const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`
  const tokenResponse = await fetch(tokenUrl)
  const tokenData = await tokenResponse.json() as { errcode?: number; errmsg?: string; access_token?: string }

  if (!tokenResponse.ok || tokenData.errcode !== 0 || !tokenData.access_token) {
    throw new Error(`获取 access_token 失败: ${tokenData.errmsg || "未知错误"}`)
  }

  return tokenData.access_token
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
      return NextResponse.json({ message: "缺少 channelId" }, { status: 400 })
    }

    if (typeof mediaType !== "string" || !isSupportedMediaType(mediaType)) {
      return NextResponse.json({ message: "不支持的 mediaType" }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "缺少上传文件" }, { status: 400 })
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
      return NextResponse.json({ message: "渠道不存在或无权限" }, { status: 404 })
    }

    if (!channel.corpId || !channel.secret) {
      return NextResponse.json({ message: "企业微信渠道缺少 corpId/secret 配置" }, { status: 400 })
    }

    const accessToken = await getAccessToken(channel.corpId, channel.secret)

    const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(accessToken)}&type=${mediaType}`
    const uploadForm = new FormData()
    uploadForm.append("media", file, file.name)

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: uploadForm,
    })

    const uploadData = await uploadResponse.json() as {
      errcode?: number
      errmsg?: string
      type?: string
      media_id?: string
      created_at?: string
    }

    if (!uploadResponse.ok || uploadData.errcode !== 0 || !uploadData.media_id) {
      return NextResponse.json(
        { message: `上传失败: ${uploadData.errmsg || "未知错误"}` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      media_id: uploadData.media_id,
      type: uploadData.type,
      created_at: uploadData.created_at,
    })
  } catch (error) {
    console.error("[WECOM_MEDIA_UPLOAD]", error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "上传失败" },
      { status: 500 }
    )
  }
}
