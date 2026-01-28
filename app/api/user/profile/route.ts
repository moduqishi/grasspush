import { auth } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { hashPassword, comparePassword } from "@/lib/utils"
import { z } from "zod"

export const runtime = "edge"

const updateProfileSchema = z.object({
    name: z.string().min(1, "昵称不能为空").max(50).optional(),
    image: z.string().url("请输入有效的图片链接").optional().or(z.literal("")),
    password: z.string().min(8, "密码至少8位").optional(),
    oldPassword: z.string().optional()
})

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user) return new NextResponse("Unauthorized", { status: 401 })

        const db = getDb()
        const user = await db.query.users.findFirst({
            where: eq(users.id, session.user.id!)
        })

        if (!user) return new NextResponse("User not found", { status: 404 })

        return NextResponse.json({
            name: user.name,
            username: user.username,
            image: user.image,
            hasPassword: !!user.password
        })
    } catch (error) {
        console.error("[PROFILE_GET]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await auth()
        if (!session?.user) return new NextResponse("Unauthorized", { status: 401 })

        const json = await req.json()
        const result = updateProfileSchema.safeParse(json)

        if (!result.success) {
            return NextResponse.json({ message: "输入格式错误", errors: result.error.flatten() }, { status: 400 })
        }

        const { name, image, password, oldPassword } = result.data
        const db = getDb()

        const user = await db.query.users.findFirst({
            where: eq(users.id, session.user.id!)
        })
        if (!user) return new NextResponse("User not found", { status: 404 })

        const updates: Record<string, any> = {}

        if (name !== undefined) updates.name = name
        if (image !== undefined) updates.image = image

        if (password) {
            // 只有当用户原本有密码时，才需要验证旧密码
            if (user.password) {
                if (!oldPassword) {
                    return NextResponse.json({ message: "请提供旧密码以验证身份" }, { status: 400 })
                }
                const isValid = await comparePassword(oldPassword, user.password)
                if (!isValid) {
                    return NextResponse.json({ message: "旧密码错误" }, { status: 400 })
                }
            }
            updates.password = await hashPassword(password)
        }

        if (Object.keys(updates).length > 0) {
            await db.update(users).set(updates).where(eq(users.id, session.user.id!))
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[PROFILE_PATCH]", error)
        return NextResponse.json({ message: "更新失败" }, { status: 500 })
    }
}
