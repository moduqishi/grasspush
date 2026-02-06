import { BaseChannel, ChannelConfig, SendMessageOptions } from "./base"

interface WecomMessage {
  msgtype: "text" | "markdown"
  text?: {
    content: string
    mentioned_list?: string[] | string
    mentioned_mobile_list?: string[] | string
  }
  markdown?: {
    content: string
  }
}

export class WecomChannel extends BaseChannel {
  readonly config: ChannelConfig = {
    type: "wecom",
    label: "企业微信群机器人",
    templates: [
      {
        type: "text",
        name: "文本消息",
        description: "发送普通文本消息，支持@用户",
        fields: [
          {
            key: "text.content",
            description: "消息内容",
            required: true,
            component: "textarea"
          },
          {
            key: "text.mentioned_list",
            description: "需要@的用户ID列表，使用逗号分隔",
            component: "input"
          },
          {
            key: "text.mentioned_mobile_list",
            description: "需要@的手机号列表，使用逗号分隔",
            component: "input"
          },
          { key: "msgtype", component: 'hidden', defaultValue: "text" },
        ]
      },
      {
        type: "markdown",
        name: "Markdown消息",
        description: "发送Markdown格式的消息, 支持在content中使用<@userid>扩展语法来@群成员",
        fields: [
          {
            key: "markdown.content",
            description: "Markdown内容",
            required: true,
            component: "textarea"
          },
          { key: "msgtype", component: 'hidden', defaultValue: "markdown" },
        ]
      }
    ]
  }

  async sendMessage(
    message: WecomMessage,
    options: SendMessageOptions
  ): Promise<Response> {
    const { webhook } = options
    
    if (!webhook) {
      throw new Error("缺少 Webhook 地址")
    }
    
    if (message.msgtype === "text" && message.text) {
      if (typeof message.text.mentioned_list === "string") {
        message.text.mentioned_list = message.text.mentioned_list
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      }
      if (typeof message.text.mentioned_mobile_list === "string") {
        message.text.mentioned_mobile_list = message.text.mentioned_mobile_list
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      }
    }

    console.log('sendWecomMessage message:', message)

    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    const data = await response.json() as { errcode?: number, errmsg: string }
    if (!response.ok || data.errcode !== 0) {
      throw new Error(`企业微信机器人消息推送失败: ${data.errmsg}`)
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
} 
