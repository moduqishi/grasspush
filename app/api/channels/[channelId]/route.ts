import { auth } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { channels, insertChannelSchema } from "@/lib/db/schema/channels"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"

export const runtime = "edge"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const db = await getDb()
    const session = await auth()
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const json = await req.json()

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, type, ...body } = insertChannelSchema.parse(json)
    const { channelId } = await params

    const channel = await db.query.channels.findFirst({
      where: and(
        eq(channels.id, channelId),
        eq(channels.userId, session.user.id!)
      ),
    })

    if (!channel) {
      return new NextResponse("Not found", { status: 404 })
    }

    const updated = await db.update(channels)
      .set(body)
      .where(eq(channels.id, channelId))
      .returning()

    return NextResponse.json(updated[0])
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(error.message, { status: 400 })
    }
    console.error("[CHANNEL_PATCH]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

// 删除渠道
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const db = await getDb()
    const session = await auth()
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const { channelId } = await params

    const channel = await db.query.channels.findFirst({
      where: and(
        eq(channels.id, channelId),
        eq(channels.userId, session.user.id!)
      ),
    })

    if (!channel) {
      return new NextResponse("Not found", { status: 404 })
    }

    await db.delete(channels)
      .where(eq(channels.id, channelId))

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[CHANNEL_DELETE]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
} 