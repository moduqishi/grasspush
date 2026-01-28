"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { toast } from "@/components/ui/use-toast"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2 } from "lucide-react"

const profileSchema = z.object({
    name: z.string().min(1, "昵称不能为空").max(50),
    image: z.string().url("请输入有效的图片链接").optional().or(z.literal("")),
})

const passwordSchema = z.object({
    oldPassword: z.string().optional(),
    password: z.string().min(8, "新密码至少8位"),
    confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
})

export default function ProfilePage() {
    const [loading, setLoading] = useState(true)
    const [hasPassword, setHasPassword] = useState(false)
    const [username, setUsername] = useState("")

    const form = useForm<z.infer<typeof profileSchema>>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: "",
            image: "",
        },
    })

    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
    })

    useEffect(() => {
        fetch("/api/user/profile")
            .then(res => res.json())
            .then((data: any) => {
                form.reset({
                    name: data.name || "",
                    image: data.image || "",
                })
                setHasPassword(data.hasPassword)
                setUsername(data.username || "")
                setLoading(false)
            })
            .catch(() => {
                toast({
                    title: "获取用户信息失败",
                    variant: "destructive",
                })
                setLoading(false)
            })
    }, [form])

    async function onProfileSubmit(values: z.infer<typeof profileSchema>) {
        try {
            const res = await fetch("/api/user/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            })

            if (!res.ok) throw new Error("更新失败")

            toast({
                title: "个人资料已更新",
                description: "请刷新页面以查看最新头像",
            })
            // 触发页面刷新以更新 Header 头像
            window.location.reload()
        } catch {
            toast({
                title: "更新失败",
                variant: "destructive",
            })
        }
    }

    async function onPasswordSubmit(values: z.infer<typeof passwordSchema>) {
        try {
            if (hasPassword && !values.oldPassword) {
                passwordForm.setError("oldPassword", { message: "请输入旧密码" })
                return
            }

            const res = await fetch("/api/user/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    password: values.password,
                    oldPassword: values.oldPassword
                }),
            })

            const data: any = await res.json()

            if (!res.ok) {
                if (data.message === "旧密码错误") {
                    passwordForm.setError("oldPassword", { message: "旧密码错误" })
                    return
                }
                throw new Error(data.message || "更新失败")
            }

            setHasPassword(true)
            passwordForm.reset()
            toast({
                title: "密码已修改",
                description: "下次登录请使用新密码",
            })
        } catch (e: any) {
            toast({
                title: "修改失败",
                description: e.message,
                variant: "destructive",
            })
        }
    }

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="flex flex-col gap-8 max-w-2xl mx-auto">
            <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-transparent bg-clip-text">
                    个人中心
                </h1>
                <p className="text-muted-foreground mt-2">
                    管理您的个人资料和安全设置 (@{username})
                </p>
            </div>

            <Card className="bg-white/50 border-blue-100">
                <CardHeader>
                    <CardTitle>基本信息</CardTitle>
                    <CardDescription>修改头像和昵称</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onProfileSubmit)} className="space-y-6">
                            <div className="flex items-center gap-6">
                                <Avatar className="h-20 w-20 border-2 border-white shadow-lg">
                                    <AvatarImage src={form.watch("image") || ""} />
                                    <AvatarFallback className="text-2xl">{username?.[0]?.toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>昵称</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="输入您的昵称" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="image"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>头像链接 (URL)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="https://example.com/avatar.png" {...field} />
                                                </FormControl>
                                                <FormDescription>
                                                    支持 JPG, PNG, GIF 等格式的图片链接
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                保存更改
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Card className="bg-white/50 border-blue-100">
                <CardHeader>
                    <CardTitle>安全设置</CardTitle>
                    <CardDescription>
                        {hasPassword ? "修改登录密码" : "您当前未设置密码 (可能使用 GitHub 登录)，请设置密码以便使用账号登录"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...passwordForm}>
                        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                            {hasPassword && (
                                <FormField
                                    control={passwordForm.control}
                                    name="oldPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>旧密码</FormLabel>
                                            <FormControl>
                                                <Input type="password" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            <FormField
                                control={passwordForm.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>新密码</FormLabel>
                                        <FormControl>
                                            <Input type="password" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={passwordForm.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>确认新密码</FormLabel>
                                        <FormControl>
                                            <Input type="password" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                                {passwordForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {hasPassword ? "修改密码" : "设置密码"}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    )
}
