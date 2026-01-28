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

        console.log("Wecom verify request, filename:", filename)

        const db = getDb()

        // 查找所有企业微信应用渠道
        const allChannels = await db
            .select({
                wecomVerifyFilename: channels.wecomVerifyFilename,
                wecomVerifyContent: channels.wecomVerifyContent,
            })
            .from(channels)
            .where(eq(channels.type, "wecom_app"))

        console.log("Found channels:", allChannels.length, allChannels.map(ch => ch.wecomVerifyFilename))

        // 灵活匹配文件名
        const matchedChannel = allChannels.find((ch) => {
            if (!ch.wecomVerifyFilename) return false

            const storedName = ch.wecomVerifyFilename.trim()
                .replace(/^WW_verify_/, "")
                .replace(/\.txt$/, "")

            const requestName = filename.trim()
                .replace(/^WW_verify_/, "")
                .replace(/\.txt$/, "")

            console.log("Comparing:", storedName, "vs", requestName)

            return storedName === requestName
        })

        if (!matchedChannel || !matchedChannel.wecomVerifyContent) {
            console.log("No match found for:", filename)
            return new Response("Not Found", { status: 404 })
        }

        console.log("Match found, returning content")

        // 返回验证文件内容
        return new Response(matchedChannel.wecomVerifyContent, {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
            },
        })
    } catch (error) {
        console.error("获取验证文件失败:", error)
        return new Response("Internal Server Error", { status: 500 })
    }
}
