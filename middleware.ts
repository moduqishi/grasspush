import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // 处理企业微信域名验证文件请求
  // 匹配 /WW_verify_xxx.txt 或 /WW_verify_xxx 格式
  if (pathname.startsWith("/WW_verify_")) {
    // 提取文件名（移除 .txt 后缀如果有）
    let filename = pathname.replace("/WW_verify_", "").replace(/\.txt$/, "")

    // 重写到 API 路由处理
    const url = request.nextUrl.clone()
    url.pathname = `/api/wecom-verify/${filename}`
    return NextResponse.rewrite(url)
  }

  const session = await auth()

  // 需要保护的 API 路由
  if (pathname.startsWith("/api/")) {
    // 检查是否是需要保护的 API 端点
    const protectedApis = [
      "/api/channels",
      "/api/endpoint-groups",
      "/api/endpoints"
    ]

    const isProtectedApi = protectedApis.some(api =>
      pathname.startsWith(api)
    )

    if (isProtectedApi && !session) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      )
    }
  }

  // 需要保护的页面路由
  if (pathname.startsWith("/moe")) {
    if (!session) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // 已登录用户不能访问登录和注册页面
  if (session && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/moe/endpoints", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // 企业微信域名验证
    "/WW_verify_:path*",
    // API 路由
    "/api/channels/:path*",
    "/api/endpoint-groups/:path*",
    "/api/endpoints/:path*",
    // 页面路由
    "/moe/:path*",
    "/login",
    "/register"
  ]
}