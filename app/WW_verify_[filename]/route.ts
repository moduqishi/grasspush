import { getDb } from "@/lib/db"
import { channels } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const runtime = "edge"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params
        const fullFilename = `WW_verify_${filename}`

        const db = getDb()

        // 查找所有企业微信应用渠道，匹配验证文件名
        const allChannels = await db
            .select({
                wecomVerifyFilename: channels.wecomVerifyFilename,
                wecomVerifyContent: channels.wecomVerifyContent,
            })
            .from(channels)
            .where(eq(channels.type, "wecom_app"))

        // 查找匹配的验证文件
        const matchedChannel = allChannels.find(
            (ch) => ch.wecomVerifyFilename === fullFilename ||
                ch.wecomVerifyFilename === filename ||
                ch.wecomVerifyFilename === `${fullFilename}.txt`
        )

        if (!matchedChannel || !matchedChannel.wecomVerifyContent) {
            return new Response("Not Found", { status: 404 })
        }

        // 返回验证文件内容
        return new Response(matchedChannel.wecomVerifyContent, {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
            },
        })
    } catch (error) {
        console.error("获取验证文件失败:", error)
        return new Response("Internal Server Error", { status: 500 })
    }
}
