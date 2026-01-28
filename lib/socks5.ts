/**
 * SOCKS5 代理工具库
 * 使用 cloudflare:sockets 实现原生 TCP 连接和 SOCKS5 协议握手
 * 支持 startTls 以在 SOCKS5 隧道上建立 HTTPS 连接
 */

export interface Socks5Config {
    hostname: string
    port: number
    username?: string
    password?: string
}

/**
 * 解析 SOCKS5 URL 格式
 * 支持格式:
 * - socks5://host:port
 * - socks5://user:pass@host:port
 * - user:pass@host:port
 * - host:port
 */
export function parseSocks5Url(url: string): Socks5Config {
    let cleanUrl = url.trim()

    // 移除协议前缀
    if (cleanUrl.startsWith("socks5://")) {
        cleanUrl = cleanUrl.slice(9)
    } else if (cleanUrl.startsWith("socks://")) {
        cleanUrl = cleanUrl.slice(8)
    }

    let username: string | undefined
    let password: string | undefined
    let hostPort: string

    // 检查是否有认证信息
    const atIndex = cleanUrl.lastIndexOf("@")
    if (atIndex !== -1) {
        const authPart = cleanUrl.slice(0, atIndex)
        hostPort = cleanUrl.slice(atIndex + 1)

        const colonIndex = authPart.indexOf(":")
        if (colonIndex !== -1) {
            username = decodeURIComponent(authPart.slice(0, colonIndex))
            password = decodeURIComponent(authPart.slice(colonIndex + 1))
        } else {
            throw new Error("SOCKS5 认证格式错误: 需要 user:pass 格式")
        }
    } else {
        hostPort = cleanUrl
    }

    // 解析 host:port
    let hostname: string
    let port: number

    // 处理 IPv6 地址 [::1]:1080
    if (hostPort.startsWith("[")) {
        const bracketEnd = hostPort.indexOf("]")
        if (bracketEnd === -1) {
            throw new Error("无效的 IPv6 地址格式")
        }
        hostname = hostPort.slice(1, bracketEnd)
        const portPart = hostPort.slice(bracketEnd + 1)
        if (portPart.startsWith(":")) {
            port = parseInt(portPart.slice(1), 10)
        } else {
            port = 1080 // 默认端口
        }
    } else {
        const colonIndex = hostPort.lastIndexOf(":")
        if (colonIndex !== -1) {
            hostname = hostPort.slice(0, colonIndex)
            port = parseInt(hostPort.slice(colonIndex + 1), 10)
        } else {
            hostname = hostPort
            port = 1080 // 默认端口
        }
    }

    if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error("无效的端口号")
    }

    return { hostname, port, username, password }
}

// Socket 接口定义
export interface SocketLike {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
    close: () => void
    startTls?: (options?: { servername?: string }) => SocketLike
}

// 动态导入类型
interface CloudflareSockets {
    connect: (
        address: { hostname: string; port: number },
        options?: { secureTransport?: "off" | "on" | "starttls" }
    ) => SocketLike
}

/**
 * 动态获取 cloudflare:sockets 的 connect 函数
 */
async function getConnect(): Promise<CloudflareSockets["connect"]> {
    const sockets = await import(/* webpackIgnore: true */ "cloudflare:sockets") as CloudflareSockets
    return sockets.connect
}

/**
 * 建立 SOCKS5 代理连接并返回可用于 TLS 升级的 socket
 */
export async function socks5Connect(
    config: Socks5Config,
    targetHost: string,
    targetPort: number,
    options?: { enableTls?: boolean }
): Promise<SocketLike> {
    const connect = await getConnect()

    // 如果需要 TLS，使用 starttls 模式
    const secureTransport = options?.enableTls ? "starttls" : "off"

    console.log(`SOCKS5: 连接代理 ${config.hostname}:${config.port}, secureTransport: ${secureTransport}`)

    const socket = connect(
        { hostname: config.hostname, port: config.port },
        { secureTransport }
    )

    const writer = socket.writable.getWriter()
    const reader = socket.readable.getReader()

    try {
        // 1. 发送认证方法协商
        const authMethods = config.username && config.password
            ? new Uint8Array([0x05, 0x02, 0x00, 0x02])
            : new Uint8Array([0x05, 0x01, 0x00])
        await writer.write(authMethods)

        // 2. 读取服务器选择的认证方法
        let response = await reader.read()
        if (response.done || !response.value || response.value.byteLength < 2) {
            throw new Error("SOCKS5 连接被关闭")
        }

        const serverResponse = new Uint8Array(response.value)
        if (serverResponse[0] !== 0x05) {
            throw new Error("服务器不支持 SOCKS5")
        }

        const selectedMethod = serverResponse[1]

        // 3. 处理认证
        if (selectedMethod === 0x02) {
            if (!config.username || !config.password) {
                throw new Error("SOCKS5 服务器要求认证但未提供凭据")
            }

            const userBytes = new TextEncoder().encode(config.username)
            const passBytes = new TextEncoder().encode(config.password)

            const authPacket = new Uint8Array([
                0x01,
                userBytes.length,
                ...userBytes,
                passBytes.length,
                ...passBytes
            ])
            await writer.write(authPacket)

            response = await reader.read()
            if (response.done || !response.value || response.value.byteLength < 2) {
                throw new Error("认证响应无效")
            }

            const authResponse = new Uint8Array(response.value)
            if (authResponse[1] !== 0x00) {
                throw new Error("SOCKS5 认证失败")
            }

            console.log("SOCKS5: 认证成功")
        } else if (selectedMethod === 0xFF) {
            throw new Error("SOCKS5 服务器拒绝所有认证方法")
        } else if (selectedMethod !== 0x00) {
            throw new Error(`不支持的认证方法: ${selectedMethod}`)
        }

        // 4. 发送 CONNECT 请求
        const hostBytes = new TextEncoder().encode(targetHost)
        const connectPacket = new Uint8Array([
            0x05, 0x01, 0x00,
            0x03, hostBytes.length,
            ...hostBytes,
            (targetPort >> 8) & 0xFF,
            targetPort & 0xFF
        ])
        await writer.write(connectPacket)

        // 5. 读取 CONNECT 响应
        response = await reader.read()
        if (response.done || !response.value || response.value.byteLength < 2) {
            throw new Error("CONNECT 响应无效")
        }

        const connectResponse = new Uint8Array(response.value)
        if (connectResponse[0] !== 0x05) {
            throw new Error("CONNECT 响应版本错误")
        }

        const replyCode = connectResponse[1]
        if (replyCode !== 0x00) {
            const errorMessages: Record<number, string> = {
                0x01: "一般性 SOCKS 服务器故障",
                0x02: "规则不允许连接",
                0x03: "网络不可达",
                0x04: "主机不可达",
                0x05: "连接被拒绝",
                0x06: "TTL 过期",
                0x07: "不支持的命令",
                0x08: "不支持的地址类型"
            }
            throw new Error(`SOCKS5 连接失败: ${errorMessages[replyCode] || `错误码 ${replyCode}`}`)
        }

        console.log(`SOCKS5: 已连接到 ${targetHost}:${targetPort}`)

        // 释放锁
        writer.releaseLock()
        reader.releaseLock()

        // 6. 如果需要 TLS，执行 startTls 升级
        if (options?.enableTls && socket.startTls) {
            console.log(`SOCKS5: 升级到 TLS, servername: ${targetHost}`)
            const tlsSocket = socket.startTls({ servername: targetHost })
            return tlsSocket
        }

        return socket
    } catch (error) {
        try { writer.releaseLock() } catch { /* ignore */ }
        try { reader.releaseLock() } catch { /* ignore */ }
        try { socket.close() } catch { /* ignore */ }
        throw error
    }
}

/**
 * 通过 SOCKS5 代理发送 HTTPS 请求
 */
export async function fetchViaSocks5(
    proxyUrl: string,
    targetUrl: string,
    options: {
        method?: string
        headers?: Record<string, string>
        body?: string
    } = {}
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
    const config = parseSocks5Url(proxyUrl)
    const url = new URL(targetUrl)

    const targetPort = url.protocol === "https:" ? 443 : 80
    const targetHost = url.hostname
    const enableTls = url.protocol === "https:"

    console.log(`fetchViaSocks5: ${options.method || "GET"} ${targetUrl}, TLS: ${enableTls}`)

    // 建立 SOCKS5 连接并可能升级到 TLS
    const socket = await socks5Connect(config, targetHost, targetPort, { enableTls })

    const writer = socket.writable.getWriter()
    const reader = socket.readable.getReader()

    try {
        // 构造 HTTP 请求
        const method = options.method || "GET"
        const path = url.pathname + url.search

        let httpRequest = `${method} ${path} HTTP/1.1\r\n`
        httpRequest += `Host: ${targetHost}\r\n`
        httpRequest += `Connection: close\r\n`
        httpRequest += `User-Agent: GrassPush/1.0\r\n`

        if (options.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
                httpRequest += `${key}: ${value}\r\n`
            }
        }

        if (options.body) {
            const bodyBytes = new TextEncoder().encode(options.body)
            httpRequest += `Content-Length: ${bodyBytes.length}\r\n`
        }

        httpRequest += `\r\n`

        if (options.body) {
            httpRequest += options.body
        }

        console.log("发送 HTTP 请求...")
        await writer.write(new TextEncoder().encode(httpRequest))

        // 读取响应
        let responseText = ""
        const decoder = new TextDecoder()

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            responseText += decoder.decode(value, { stream: true })
        }

        console.log("收到响应:", responseText.slice(0, 200))

        // 解析 HTTP 响应
        const headerEnd = responseText.indexOf("\r\n\r\n")
        const bodyPart = headerEnd !== -1 ? responseText.slice(headerEnd + 4) : responseText

        const headerPart = headerEnd !== -1 ? responseText.slice(0, headerEnd) : ""
        const statusLine = headerPart.split("\r\n")[0] || ""
        const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/)
        const status = statusMatch ? parseInt(statusMatch[1], 10) : 200

        writer.releaseLock()
        reader.releaseLock()
        socket.close()

        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(bodyPart)
        }
    } catch (error) {
        try { writer.releaseLock() } catch { /* ignore */ }
        try { reader.releaseLock() } catch { /* ignore */ }
        try { socket.close() } catch { /* ignore */ }
        throw error
    }
}
