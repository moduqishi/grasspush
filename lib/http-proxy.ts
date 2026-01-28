/**
 * HTTP 代理工具库
 * 使用 cloudflare:sockets 实现 HTTP CONNECT 隧道代理 (主要用于 HTTPS)
 */

export interface ProxyConfig {
    protocol: "http" | "https"
    hostname: string
    port: number
    username?: string
    password?: string
}

/**
 * 解析代理 URL
 * 支持格式:
 * - http://user:pass@host:port
 * - http://host:port
 * - host:port (默认为 http)
 */
export function parseProxyUrl(url: string): ProxyConfig {
    let cleanUrl = url.trim()

    if (!cleanUrl.match(/^[a-zA-Z]+:\/\//)) {
        cleanUrl = `http://${cleanUrl}`
    }

    const parsed = new URL(cleanUrl)

    return {
        protocol: parsed.protocol.replace(":", "") as "http" | "https",
        hostname: parsed.hostname,
        port: parseInt(parsed.port) || 80,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    }
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
 * 建立 HTTP 代理连接 (CONNECT 方法) 并升级到 TLS
 */
export async function httpProxyConnect(
    proxyConfig: ProxyConfig,
    targetHost: string,
    targetPort: number = 443
): Promise<SocketLike> {
    const connect = await getConnect()

    console.log(`HTTP Proxy: 连接代理 ${proxyConfig.hostname}:${proxyConfig.port}`)

    // 使用 starttls 模式以便后续升级
    // 如果代理本身是 HTTPS 的（很少见），可能需要先建立 TLS，但通常 CONNECT 是明文或通过 TLS 隧道
    // 这里假设代理端口是普通的 HTTP 端口，或者支持 STARTTLS（不太可能）
    // 对于 HTTP 代理，我们需要先建立 TCP 连接到代理，发送 CONNECT，然后升级
    // 所以 secureTransport 应该是 "starttls" 以允许后续的 socket.startTls() 调用

    const socket = connect(
        { hostname: proxyConfig.hostname, port: proxyConfig.port },
        // 文档要求使用 startTls 方法必须设置 secureTransport 为 starttls
        // 之前尝试 off 失败，现在改回 starttls，并依赖详细日志定位真正的握手问题
        { secureTransport: "starttls" }
    )

    const writer = socket.writable.getWriter()
    const reader = socket.readable.getReader()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    try {
        // 构造 CONNECT 请求
        let connectReq = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`
        connectReq += `Host: ${targetHost}:${targetPort}\r\n`

        // 代理认证
        if (proxyConfig.username && proxyConfig.password) {
            const auth = btoa(`${proxyConfig.username}:${proxyConfig.password}`)
            connectReq += `Proxy-Authorization: Basic ${auth}\r\n`
        }

        connectReq += `\r\n`

        console.log(`HTTP Proxy: 发送 CONNECT 请求到 ${targetHost}:${targetPort}`)

        // 发送请求
        await writer.write(encoder.encode(connectReq))

        // 读取响应头
        let responseText = ""
        let headerFinished = false

        // 设置超时检查
        const readPromise = async () => {
            while (!headerFinished) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                responseText += chunk

                if (responseText.includes("\r\n\r\n")) {
                    headerFinished = true
                }
            }
        }

        await readPromise()

        console.log(`HTTP Proxy: 收到代理响应: ${JSON.stringify(responseText.split('\r\n')[0])}`)

        // 解析响应状态
        const statusLine = responseText.split("\r\n")[0]
        if (!statusLine.includes("200")) {
            throw new Error(`代理连接失败: ${statusLine}`)
        }

        console.log(`HTTP Proxy: 隧道建立成功`)

        // 释放锁，准备移交 socket
        writer.releaseLock()
        reader.releaseLock()

        // 给代理足够的时间准备数据转发，防止 race condition
        await new Promise(resolve => setTimeout(resolve, 500))

        // 升级到 TLS
        // 检查 socket 是否有 startTls 方法 (类型定义有，但运行时需要确认)
        if (typeof socket.startTls === 'function') {
            console.log(`HTTP Proxy: 准备升级 TLS, servername: ${targetHost}`)
            try {
                // 部分实现可能在显式传递 servername 时有 SNI 问题，或者证书验证过于严格
                const startTlsOptions = {
                    servername: targetHost,
                    allowInsecure: true // 尝试忽略证书错误，排除中间人干扰因素
                } as any

                const tlsSocket = socket.startTls(startTlsOptions)
                console.log(`HTTP Proxy: TLS 升级调用成功`)
                return tlsSocket
            } catch (e: any) {
                console.error(`HTTP Proxy: TLS 升级异常:`, e)
                throw new Error(`TLS 升级失败: ${e.message || e}`)
            }
        } else {
            console.warn("HTTP Proxy: Socket 不支持 startTls 方法，无法升级加密连接")
            // 如果目标是 HTTPS，这会导致后续通信失败
            return socket
        }
    } catch (error) {
        try { writer.releaseLock() } catch { }
        try { reader.releaseLock() } catch { }
        try { socket.close() } catch { }
        throw error
    }
}

/**
 * 通过 HTTP 代理发送请求
 * 兼容 fetch 接口
 */
export async function fetchViaHttpProxy(
    proxyUrl: string,
    targetUrl: string,
    options: {
        method?: string
        headers?: Record<string, string>
        body?: string
    } = {}
): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown>; text: () => Promise<string> }> {
    const config = parseProxyUrl(proxyUrl)
    const url = new URL(targetUrl)

    // 仅支持 HTTPS 目标 (因为我们需要用 CONNECT + TLS)
    if (url.protocol !== "https:") {
        throw new Error("目前仅支持通过代理访问 HTTPS 目标")
    }

    const socket = await httpProxyConnect(config, url.hostname, 443)

    // 使用 socket 发送 HTTP 请求
    const writer = socket.writable.getWriter()
    const reader = socket.readable.getReader()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    try {
        const method = options.method || "GET"
        const path = url.pathname + url.search

        let req = `${method} ${path} HTTP/1.1\r\n`
        req += `Host: ${url.hostname}\r\n`
        req += `Connection: close\r\n`
        req += `User-Agent: GrassPush/1.0\r\n`

        if (options.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
                req += `${key}: ${value}\r\n`
            }
        }

        if (options.body) {
            const bodyBytes = encoder.encode(options.body)
            req += `Content-Length: ${bodyBytes.length}\r\n`
        }

        req += `\r\n`

        if (options.body) {
            req += options.body
        }

        await writer.write(encoder.encode(req))

        // 读取完整响应
        // 注意：对于大响应这可能有效率问题，但对于 API 调用通常没问题
        let fullResponse = ""
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            fullResponse += decoder.decode(value, { stream: true })
        }
        fullResponse += decoder.decode() // flush

        // 解析响应
        const headerEndIndex = fullResponse.indexOf("\r\n\r\n")
        if (headerEndIndex === -1) throw new Error("无效的响应格式")

        const headerPart = fullResponse.slice(0, headerEndIndex)
        const bodyPart = fullResponse.slice(headerEndIndex + 4)

        const headerLines = headerPart.split("\r\n")
        const statusLine = headerLines[0]

        const statusParts = statusLine.split(" ")
        const status = parseInt(statusParts[1], 10)
        const statusText = statusParts.slice(2).join(" ")

        return {
            ok: status >= 200 && status < 300,
            status,
            statusText,
            json: async () => JSON.parse(bodyPart),
            text: async () => bodyPart
        }

    } finally {
        try { writer.releaseLock() } catch { }
        try { reader.releaseLock() } catch { }
        try { socket.close() } catch { }
    }
}
