/**
 * SOCKS5 代理工具库
 * 使用 cloudflare:sockets 实现原生 TCP 连接和 SOCKS5 协议握手
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

export interface SocketLike {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
    close: () => void
}

/**
 * 动态获取 cloudflare:sockets 的 connect 函数
 * 使用动态导入避免构建时解析问题
 */
async function getConnect(): Promise<(address: { hostname: string; port: number }) => SocketLike> {
    // 使用动态导入，这样构建时不会尝试解析 cloudflare:sockets
    const sockets = await import(/* webpackIgnore: true */ "cloudflare:sockets")
    return sockets.connect
}

/**
 * 建立 SOCKS5 代理连接
 * 完成 SOCKS5 握手后返回可用于数据传输的 socket
 */
export async function socks5Connect(
    config: Socks5Config,
    targetHost: string,
    targetPort: number
): Promise<SocketLike> {
    const connect = await getConnect()
    const socket = connect({ hostname: config.hostname, port: config.port })
    const writer = socket.writable.getWriter()
    const reader = socket.readable.getReader()

    try {
        // 1. 发送认证方法协商
        // 0x05 = SOCKS5 版本
        // 0x02 = 支持 2 种认证方法 (0x00 无认证, 0x02 用户名密码)
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
            // 用户名密码认证
            if (!config.username || !config.password) {
                throw new Error("SOCKS5 服务器要求认证但未提供凭据")
            }

            const userBytes = new TextEncoder().encode(config.username)
            const passBytes = new TextEncoder().encode(config.password)

            // 认证请求格式: [版本][用户名长度][用户名][密码长度][密码]
            const authPacket = new Uint8Array([
                0x01, // 子协商版本
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
                throw new Error("SOCKS5 认证失败: 用户名或密码错误")
            }
        } else if (selectedMethod === 0xFF) {
            throw new Error("SOCKS5 服务器拒绝所有认证方法")
        } else if (selectedMethod !== 0x00) {
            throw new Error(`不支持的认证方法: ${selectedMethod}`)
        }

        // 4. 发送 CONNECT 请求
        const hostBytes = new TextEncoder().encode(targetHost)

        // CONNECT 请求格式:
        // [版本][命令][保留][地址类型][地址][端口]
        // 0x05 = SOCKS5
        // 0x01 = CONNECT
        // 0x00 = 保留
        // 0x03 = 域名类型
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

        // 6. 握手完成，释放锁并返回 socket
        writer.releaseLock()
        reader.releaseLock()

        return socket
    } catch (error) {
        // 清理资源
        try { writer.releaseLock() } catch { /* ignore */ }
        try { reader.releaseLock() } catch { /* ignore */ }
        try { socket.close() } catch { /* ignore */ }
        throw error
    }
}
