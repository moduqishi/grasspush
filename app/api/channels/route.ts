import { auth } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { channels, insertChannelSchema } from "@/lib/db/schema/channels"
import { generateId } from "@/lib/utils"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"

export const runtime = "edge"

export async function GET() {
  try {
    const db = await getDb()
    const session = await auth()
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const channelList = await db.query.channels.findMany({
      where: eq(channels.userId, session.user.id!),
      orderBy: (channels, { desc }) => [desc(channels.createdAt)],
    })

    return NextResponse.json(channelList)
  } catch (error) {
    console.error("[CHANNELS_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

// 创建新渠道
export async function POST(req: Request) {
  try {
    const db = await getDb()
    const session = await auth()
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const json = await req.json() as Record<string, unknown>

    const body = insertChannelSchema.parse({
      ...json,
      id: generateId(),
      userId: session.user.id!,
      status: "active" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    const channel = await db.insert(channels).values(body as any).returning()

    return NextResponse.json(channel[0])
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(error.message, { status: 400 })
    }
    console.error("[CHANNELS_POST]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
} 