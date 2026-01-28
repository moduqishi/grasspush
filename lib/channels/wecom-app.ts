import { BaseChannel, ChannelConfig, SendMessageOptions } from "./base"
import { fetchViaHttpProxy } from "@/lib/http-proxy"

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
   * 发送消息到企业微信应用
   * 如果配置了代理（socks5Proxy字段兼容HTTP代理），则通过代理发送
   */
  async sendMessage(
    message: WecomAppMessage,
    options: SendMessageOptions
  ): Promise<Response> {
    // 复用 socks5Proxy 字段存储 HTTP 代理地址
    const { corpId, agentId, secret, socks5Proxy } = options

    if (!corpId || !agentId || !secret) {
      throw new Error("缺少必要的配置信息")
    }

    console.log('sendWecomAppMessage:', {
      hasProxy: !!socks5Proxy,
      corpId,
      agentId,
    })

    // 获取 access_token
    const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`

    let tokenData: WecomTokenResponse

    if (socks5Proxy) {
      // 通过 HTTP 代理获取 token
      console.log('通过 HTTP 代理获取 access_token')
      try {
        const tokenResponse = await fetchViaHttpProxy(socks5Proxy, tokenUrl)
        tokenData = await tokenResponse.json() as WecomTokenResponse
        console.log('Token response:', tokenData)
      } catch (error) {
        console.error('代理请求失败:', error)
        throw new Error(`代理请求失败: ${error}`)
      }

      if (tokenData.errcode !== 0 && !tokenData.access_token) {
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
      // 通过 HTTP 代理发送消息
      console.log('通过 HTTP 代理发送消息')
      try {
        const sendResponse = await fetchViaHttpProxy(socks5Proxy, sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: messageBody,
        })
        sendData = await sendResponse.json() as WecomSendResponse
        console.log('Send response:', sendData)
      } catch (error) {
        console.error('代理发送失败:', error)
        throw new Error(`代理发送失败: ${error}`)
      }
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