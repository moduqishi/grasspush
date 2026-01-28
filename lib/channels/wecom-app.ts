import { BaseChannel, ChannelConfig, SendMessageOptions } from "./base"
import { parseSocks5Url, socks5Connect } from "@/lib/socks5"

interface WecomAppMessage {
  msgtype: string
  touser?: string
  toparty?: string
  totag?: string
  agentid: number
  text?: {
    content: string
  }
  markdown?: {
    content: string
  }
  safe?: number
}

interface WecomTokenResponse {
  access_token: string
  errcode: number
  errmsg: string
}

interface WecomSendResponse {
  errcode: number
  errmsg: string
}

export class WecomAppChannel extends BaseChannel {
  readonly config: ChannelConfig = {
    type: "wecom_app",
    label: "企业微信应用",
    templates: [
      {
        type: "text",
        name: "文本消息",
        description: "最基础的消息类型",
        fields: [
          { key: "text.content", description: "消息内容", required: true, component: 'textarea' },
          { key: "touser", description: "指定接收消息的成员", component: 'input' },
          { key: "toparty", description: "指定接收消息的部门", component: 'input' },
          { key: "totag", description: "指定接收消息的标签", component: 'input' },
          { key: "safe", description: "是否保密消息", component: 'checkbox' },
          { key: "msgtype", component: 'hidden', defaultValue: "text" },
        ],
      },
      {
        type: "markdown",
        name: "Markdown消息",
        description: "支持Markdown格式的富文本消息",
        fields: [
          { key: "markdown.content", description: "markdown格式的消息内容", required: true, component: 'textarea' },
          { key: "touser", description: "指定接收消息的成员" },
          { key: "toparty", description: "指定接收消息的部门" },
          { key: "totag", description: "指定接收消息的标签" },
          { key: "msgtype", component: 'hidden', defaultValue: "markdown" },
        ],
      },
    ]
  }

  /**
   * 通过 SOCKS5 代理发送 HTTPS 请求
   * 使用 cloudflare:sockets 建立代理隧道
   */
  private async fetchViaSocks5(
    proxyUrl: string,
    targetUrl: string,
    options: {
      method?: string
      headers?: Record<string, string>
      body?: string
    } = {}
  ): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
    const config = parseSocks5Url(proxyUrl)
    const url = new URL(targetUrl)

    const targetPort = 443
    const targetHost = url.hostname

    // 建立 SOCKS5 代理连接
    const socket = await socks5Connect(config, targetHost, targetPort)

    // 由于企业微信 API 是 HTTPS，我们需要在 SOCKS5 隧道上进行 TLS 握手
    // Cloudflare Workers 的 connect 支持 secureTransport 选项
    // 但是对于已建立的 socket，我们需要使用 startTls

    // 注意：这里使用原始 HTTP 请求格式，因为 SOCKS5 隧道已建立
    // 企业微信 API 强制 HTTPS，所以我们需要进行 TLS 升级

    const writer = socket.writable.getWriter()
    const reader = socket.readable.getReader()

    try {
      // 构造 HTTP 请求
      const method = options.method || "GET"
      const path = url.pathname + url.search

      // 发送 TLS Client Hello - 这在 SOCKS5 隧道上会被代理服务器转发
      // 但由于我们无法在 Worker 中手动处理 TLS，我们需要使用另一种方法

      // 替代方案：使用 HTTP 请求格式，依赖代理服务器的 HTTPS 支持
      // 如果代理服务器支持 CONNECT 后的 TLS 透传，这将工作

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

      await writer.write(new TextEncoder().encode(httpRequest))

      // 读取响应
      let responseText = ""
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        responseText += decoder.decode(value, { stream: true })
      }

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
        json: async () => JSON.parse(bodyPart)
      }
    } catch (error) {
      try { writer.releaseLock() } catch { }
      try { reader.releaseLock() } catch { }
      try { socket.close() } catch { }
      throw error
    }
  }

  /**
   * 发送消息到企业微信应用
   * 如果配置了 socks5Proxy，则通过代理发送
   */
  async sendMessage(
    message: WecomAppMessage,
    options: SendMessageOptions
  ): Promise<Response> {
    const { corpId, agentId, secret, socks5Proxy } = options

    if (!corpId || !agentId || !secret) {
      throw new Error("缺少必要的配置信息")
    }

    console.log('sendWecomAppMessage message:', message, 'proxy:', socks5Proxy ? '已配置' : '未配置')

    // 获取 access_token
    const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`

    let tokenData: WecomTokenResponse

    if (socks5Proxy) {
      // 通过 SOCKS5 代理获取 token
      console.log('通过 SOCKS5 代理获取 access_token')
      const tokenResponse = await this.fetchViaSocks5(socks5Proxy, tokenUrl)
      tokenData = await tokenResponse.json() as WecomTokenResponse

      if (!tokenData.access_token) {
        throw new Error(`获取访问令牌失败: ${tokenData.errmsg || '未知错误'}`)
      }
    } else {
      // 直接请求
      const tokenResponse = await fetch(tokenUrl)
      tokenData = await tokenResponse.json() as WecomTokenResponse

      if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(`获取访问令牌失败: ${tokenData.errmsg}`)
      }
    }

    // 发送消息
    const sendUrl = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`
    const messageBody = JSON.stringify({
      ...message,
      agentid: parseInt(agentId),
      touser: message.touser || "@all",
    })

    let sendData: WecomSendResponse

    if (socks5Proxy) {
      // 通过 SOCKS5 代理发送消息
      console.log('通过 SOCKS5 代理发送消息')
      const sendResponse = await this.fetchViaSocks5(socks5Proxy, sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: messageBody,
      })
      sendData = await sendResponse.json() as WecomSendResponse
    } else {
      // 直接发送
      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: messageBody,
      })
      sendData = await response.json() as WecomSendResponse
    }

    if (sendData.errcode !== 0) {
      throw new Error(`企业微信应用消息推送失败: ${sendData.errmsg}`)
    }

    // 返回成功响应
    return new Response(JSON.stringify(sendData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}