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

        // URL: /WW_verify_xxx -> filename = "xxx"
        // URL: /WW_verify_xxx.txt (经过 rewrite) -> filename = "xxx"

        // 可能的文件名格式:
        // - WW_verify_xxx (完整格式)
        // - WW_verify_xxx.txt (带后缀)
        // - xxx (只有验证码部分)
        const possibleMatches = [
            filename,                          // xxx
            `WW_verify_${filename}`,           // WW_verify_xxx
            `WW_verify_${filename}.txt`,       // WW_verify_xxx.txt
        ]

        const db = getDb()

        // 查找所有企业微信应用渠道
        const allChannels = await db
            .select({
                wecomVerifyFilename: channels.wecomVerifyFilename,
                wecomVerifyContent: channels.wecomVerifyContent,
            })
            .from(channels)
            .where(eq(channels.type, "wecom_app"))

        console.log("Verify request:", {
            filename,
            possibleMatches,
            channelsCount: allChannels.length,
            channelFilenames: allChannels.map(ch => ch.wecomVerifyFilename)
        })

        // 查找匹配的验证文件（灵活匹配）
        const matchedChannel = allChannels.find((ch) => {
            if (!ch.wecomVerifyFilename) return false

            const storedName = ch.wecomVerifyFilename.trim()

            // 尝试匹配多种格式
            return possibleMatches.some(match =>
                storedName === match ||
                storedName === match.replace(/\.txt$/, "") ||
                storedName.replace(/^WW_verify_/, "").replace(/\.txt$/, "") ===
                filename.replace(/^WW_verify_/, "").replace(/\.txt$/, "")
            )
        })

        if (!matchedChannel || !matchedChannel.wecomVerifyContent) {
            console.log("No match found for:", filename)
            return new Response("Not Found", { status: 404 })
        }

        console.log("Match found:", matchedChannel.wecomVerifyFilename)

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
