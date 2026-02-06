import { BaseChannel, ChannelConfig, SendMessageOptions, TemplateField } from "./base"
import { fetchViaHttpProxy } from "@/lib/http-proxy"

interface WecomAppMessage {
  msgtype: string
  touser?: string
  toparty?: string
  totag?: string
  agentid?: number
  [key: string]: unknown
}

interface WecomTokenResponse {
  access_token: string
  errcode: number
  errmsg: string
}

interface WecomSendResponse {
  errcode: number
  errmsg: string
  invaliduser?: string
  invalidparty?: string
  invalidtag?: string
  unlicenseduser?: string
  msgid?: string
  response_code?: string
}

const RECIPIENT_FIELDS: TemplateField[] = [
  { key: "touser", description: "成员ID，多个用 | 分隔（为空时默认 @all，小程序通知除外）" },
  { key: "toparty", description: "部门ID，多个用 | 分隔" },
  { key: "totag", description: "标签ID，多个用 | 分隔" },
]

const DUPLICATE_FIELDS: TemplateField[] = [
  {
    key: "enable_duplicate_check",
    description: "是否开启重复消息检查",
    component: "select",
    defaultValue: "0",
    options: [
      { value: "0", label: "关闭" },
      { value: "1", label: "开启" },
    ],
  },
  {
    key: "duplicate_check_interval",
    description: "重复消息检查间隔（秒，默认 1800，最大 14400）",
    component: "input",
    defaultValue: "1800",
  },
]

const ENABLE_ID_TRANS_FIELD: TemplateField = {
  key: "enable_id_trans",
  description: "是否开启 ID 转译",
  component: "select",
  defaultValue: "0",
  options: [
    { value: "0", label: "关闭" },
    { value: "1", label: "开启" },
  ],
}

const SAFE_FIELD: TemplateField = {
  key: "safe",
  description: "保密等级",
  component: "select",
  defaultValue: "0",
  options: [
    { value: "0", label: "0: 可分享" },
    { value: "1", label: "1: 保密(水印)" },
  ],
}

const SAFE_MPNEWS_FIELD: TemplateField = {
  key: "safe",
  description: "保密等级",
  component: "select",
  defaultValue: "0",
  options: [
    { value: "0", label: "0: 可分享" },
    { value: "1", label: "1: 保密(水印)" },
    { value: "2", label: "2: 仅企业内分享(mpnews专属)" },
  ],
}

const TEMPLATE_CARD_SHARED_FIELDS: TemplateField[] = [
  {
    key: "template_card.source",
    description: "来源样式 source（JSON）",
    component: "textarea",
    placeholder: '{"icon_url":"https://example.com/icon.png","desc":"企业微信","desc_color":1}',
  },
  {
    key: "template_card.action_menu",
    description: "右上角菜单 action_menu（JSON）",
    component: "textarea",
    placeholder: '{"desc":"更多操作","action_list":[{"text":"接受推送","key":"A"}]}',
  },
  { key: "template_card.task_id", description: "任务ID（填写 action_menu 时必填）" },
]

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
          ...RECIPIENT_FIELDS,
          SAFE_FIELD,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: 'hidden', defaultValue: "text" },
        ],
      },
      {
        type: "image",
        name: "图片消息",
        description: "发送图片媒体消息",
        fields: [
          { key: "image.media_id", description: "图片媒体 ID（上传临时素材接口返回）", required: true },
          ...RECIPIENT_FIELDS,
          SAFE_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "image" },
        ],
      },
      {
        type: "voice",
        name: "语音消息",
        description: "发送语音媒体消息",
        fields: [
          { key: "voice.media_id", description: "语音媒体 ID（上传临时素材接口返回）", required: true },
          ...RECIPIENT_FIELDS,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "voice" },
        ],
      },
      {
        type: "video",
        name: "视频消息",
        description: "发送视频媒体消息",
        fields: [
          { key: "video.media_id", description: "视频媒体 ID（上传临时素材接口返回）", required: true },
          { key: "video.title", description: "视频标题（可选）" },
          { key: "video.description", description: "视频描述（可选）", component: "textarea" },
          ...RECIPIENT_FIELDS,
          SAFE_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "video" },
        ],
      },
      {
        type: "file",
        name: "文件消息",
        description: "发送文件消息",
        fields: [
          { key: "file.media_id", description: "文件媒体 ID（上传临时素材接口返回）", required: true },
          ...RECIPIENT_FIELDS,
          SAFE_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "file" },
        ],
      },
      {
        type: "markdown",
        name: "Markdown消息",
        description: "支持Markdown格式的富文本消息",
        fields: [
          { key: "markdown.content", description: "markdown格式的消息内容", required: true, component: 'textarea' },
          ...RECIPIENT_FIELDS,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: 'hidden', defaultValue: "markdown" },
        ],
      },
      {
        type: "textcard",
        name: "文本卡片消息",
        description: "文本卡片，可展示更丰富内容",
        fields: [
          { key: "textcard.title", description: "卡片标题", required: true },
          { key: "textcard.description", description: "卡片描述（支持div/br样式）", required: true, component: "textarea" },
          { key: "textcard.url", description: "点击跳转链接（http/https）", required: true },
          { key: "textcard.btntxt", description: "按钮文本（可选）" },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "textcard" },
        ],
      },
      {
        type: "news",
        name: "图文消息（news）",
        description: "图文消息，articles 为 JSON 数组（1-8条）",
        fields: [
          {
            key: "news.articles",
            description: "articles（JSON数组）",
            required: true,
            component: "textarea",
            placeholder: '[{"title":"标题","description":"描述","url":"https://example.com","picurl":"https://example.com/a.png"}]',
          },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "news" },
        ],
      },
      {
        type: "mpnews",
        name: "图文消息（mpnews）",
        description: "企业微信存储的图文消息，articles 为 JSON 数组（1-8条）",
        fields: [
          {
            key: "mpnews.articles",
            description: "articles（JSON数组）",
            required: true,
            component: "textarea",
            placeholder: '[{"title":"标题","thumb_media_id":"MEDIA_ID","content":"内容","author":"作者","digest":"摘要"}]',
          },
          ...RECIPIENT_FIELDS,
          SAFE_MPNEWS_FIELD,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "mpnews" },
        ],
      },
      {
        type: "miniprogram_notice",
        name: "小程序通知消息",
        description: "仅绑定了小程序的应用可发送；不支持 @all",
        fields: [
          { key: "miniprogram_notice.appid", description: "小程序 AppID", required: true },
          { key: "miniprogram_notice.page", description: "点击后跳转页面（可选）" },
          { key: "miniprogram_notice.title", description: "标题（4-12个汉字）", required: true },
          { key: "miniprogram_notice.description", description: "描述（可选）" },
          { key: "miniprogram_notice.emphasis_first_item", description: "是否强调首项", component: "checkbox" },
          {
            key: "miniprogram_notice.content_item",
            description: "内容项 content_item（JSON数组，最多10项）",
            component: "textarea",
            placeholder: '[{"key":"会议室","value":"402"},{"key":"会议时间","value":"2026-02-06 16:16"}]',
          },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "miniprogram_notice" },
        ],
      },
      {
        type: "template_card.text_notice",
        name: "模板卡片-文本通知型",
        description: "template_card.card_type = text_notice",
        fields: [
          ...TEMPLATE_CARD_SHARED_FIELDS,
          { key: "template_card.main_title.title", description: "主标题（可选）" },
          { key: "template_card.main_title.desc", description: "主标题辅助信息（可选）" },
          { key: "template_card.sub_title_text", description: "二级文本（可选）", component: "textarea" },
          {
            key: "template_card.quote_area",
            description: "引用区 quote_area（JSON）",
            component: "textarea",
            placeholder: '{"type":1,"url":"https://work.weixin.qq.com","title":"引用标题","quote_text":"引用文案"}',
          },
          {
            key: "template_card.emphasis_content",
            description: "关键数据 emphasis_content（JSON）",
            component: "textarea",
            placeholder: '{"title":"100","desc":"核心数据"}',
          },
          {
            key: "template_card.horizontal_content_list",
            description: "横向列表 horizontal_content_list（JSON数组）",
            component: "textarea",
            placeholder: '[{"keyname":"邀请人","value":"张三"}]',
          },
          {
            key: "template_card.jump_list",
            description: "跳转列表 jump_list（JSON数组）",
            component: "textarea",
            placeholder: '[{"type":1,"title":"企业微信官网","url":"https://work.weixin.qq.com"}]',
          },
          {
            key: "template_card.card_action",
            description: "卡片点击事件 card_action（JSON，必填）",
            required: true,
            component: "textarea",
            placeholder: '{"type":1,"url":"https://work.weixin.qq.com"}',
          },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "template_card.card_type", component: "hidden", defaultValue: "text_notice" },
          { key: "msgtype", component: "hidden", defaultValue: "template_card" },
        ],
      },
      {
        type: "template_card.news_notice",
        name: "模板卡片-图文展示型",
        description: "template_card.card_type = news_notice",
        fields: [
          ...TEMPLATE_CARD_SHARED_FIELDS,
          { key: "template_card.main_title.title", description: "主标题", required: true },
          { key: "template_card.main_title.desc", description: "主标题辅助信息（可选）" },
          {
            key: "template_card.quote_area",
            description: "引用区 quote_area（JSON）",
            component: "textarea",
            placeholder: '{"type":1,"url":"https://work.weixin.qq.com","title":"引用标题","quote_text":"引用文案"}',
          },
          {
            key: "template_card.image_text_area",
            description: "左图右文 image_text_area（JSON）",
            component: "textarea",
            placeholder: '{"type":1,"url":"https://work.weixin.qq.com","title":"左图右文标题","desc":"描述","image_url":"https://example.com/a.png"}',
          },
          {
            key: "template_card.card_image",
            description: "主图 card_image（JSON）",
            component: "textarea",
            placeholder: '{"url":"https://example.com/banner.png","aspect_ratio":1.3}',
          },
          {
            key: "template_card.vertical_content_list",
            description: "纵向列表 vertical_content_list（JSON数组）",
            component: "textarea",
            placeholder: '[{"title":"二级标题","desc":"二级描述"}]',
          },
          {
            key: "template_card.horizontal_content_list",
            description: "横向列表 horizontal_content_list（JSON数组）",
            component: "textarea",
            placeholder: '[{"keyname":"邀请人","value":"张三"}]',
          },
          {
            key: "template_card.jump_list",
            description: "跳转列表 jump_list（JSON数组）",
            component: "textarea",
            placeholder: '[{"type":1,"title":"企业微信官网","url":"https://work.weixin.qq.com"}]',
          },
          {
            key: "template_card.card_action",
            description: "卡片点击事件 card_action（JSON，必填）",
            required: true,
            component: "textarea",
            placeholder: '{"type":1,"url":"https://work.weixin.qq.com"}',
          },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "template_card.card_type", component: "hidden", defaultValue: "news_notice" },
          { key: "msgtype", component: "hidden", defaultValue: "template_card" },
        ],
      },
      {
        type: "template_card.button_interaction",
        name: "模板卡片-按钮交互型",
        description: "template_card.card_type = button_interaction",
        fields: [
          ...TEMPLATE_CARD_SHARED_FIELDS,
          { key: "template_card.main_title.title", description: "主标题", required: true },
          { key: "template_card.main_title.desc", description: "主标题辅助信息（可选）" },
          {
            key: "template_card.quote_area",
            description: "引用区 quote_area（JSON）",
            component: "textarea",
            placeholder: '{"type":1,"url":"https://work.weixin.qq.com","title":"引用标题","quote_text":"引用文案"}',
          },
          { key: "template_card.sub_title_text", description: "二级文本（可选）", component: "textarea" },
          {
            key: "template_card.horizontal_content_list",
            description: "横向列表 horizontal_content_list（JSON数组）",
            component: "textarea",
            placeholder: '[{"keyname":"邀请人","value":"张三"}]',
          },
          {
            key: "template_card.card_action",
            description: "卡片点击事件 card_action（JSON）",
            component: "textarea",
            placeholder: '{"type":1,"url":"https://work.weixin.qq.com"}',
          },
          {
            key: "template_card.button_selection",
            description: "下拉选择器 button_selection（JSON）",
            component: "textarea",
            placeholder: '{"question_key":"q1","title":"评分","option_list":[{"id":"a","text":"100分"}]}',
          },
          {
            key: "template_card.button_list",
            description: "按钮列表 button_list（JSON数组，必填）",
            required: true,
            component: "textarea",
            placeholder: '[{"text":"按钮1","style":1,"key":"button_key_1"}]',
          },
          { key: "template_card.task_id", description: "任务ID（必填）", required: true },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "template_card.card_type", component: "hidden", defaultValue: "button_interaction" },
          { key: "msgtype", component: "hidden", defaultValue: "template_card" },
        ],
      },
      {
        type: "template_card.vote_interaction",
        name: "模板卡片-投票选择型",
        description: "template_card.card_type = vote_interaction",
        fields: [
          {
            key: "template_card.source",
            description: "来源样式 source（JSON）",
            component: "textarea",
            placeholder: '{"icon_url":"https://example.com/icon.png","desc":"企业微信"}',
          },
          { key: "template_card.main_title.title", description: "主标题", required: true },
          { key: "template_card.main_title.desc", description: "描述（可选）" },
          { key: "template_card.task_id", description: "任务ID（必填）", required: true },
          {
            key: "template_card.checkbox",
            description: "选择题 checkbox（JSON，必填）",
            required: true,
            component: "textarea",
            placeholder: '{"question_key":"q1","mode":1,"option_list":[{"id":"o1","text":"选项1","is_checked":true}]}',
          },
          {
            key: "template_card.submit_button",
            description: "提交按钮 submit_button（JSON，必填）",
            required: true,
            component: "textarea",
            placeholder: '{"text":"提交","key":"submit_key"}',
          },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "template_card.card_type", component: "hidden", defaultValue: "vote_interaction" },
          { key: "msgtype", component: "hidden", defaultValue: "template_card" },
        ],
      },
      {
        type: "template_card.multiple_interaction",
        name: "模板卡片-多项选择型",
        description: "template_card.card_type = multiple_interaction",
        fields: [
          {
            key: "template_card.source",
            description: "来源样式 source（JSON）",
            component: "textarea",
            placeholder: '{"icon_url":"https://example.com/icon.png","desc":"企业微信"}',
          },
          { key: "template_card.main_title.title", description: "主标题", required: true },
          { key: "template_card.main_title.desc", description: "描述（可选）" },
          { key: "template_card.task_id", description: "任务ID（必填）", required: true },
          {
            key: "template_card.select_list",
            description: "选择器列表 select_list（JSON数组，必填）",
            required: true,
            component: "textarea",
            placeholder: '[{"question_key":"q1","title":"标签1","option_list":[{"id":"s1","text":"选项1"}]}]',
          },
          {
            key: "template_card.submit_button",
            description: "提交按钮 submit_button（JSON，必填）",
            required: true,
            component: "textarea",
            placeholder: '{"text":"提交","key":"submit_key"}',
          },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "template_card.card_type", component: "hidden", defaultValue: "multiple_interaction" },
          { key: "msgtype", component: "hidden", defaultValue: "template_card" },
        ],
      },
    ]
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((acc: unknown, part: string) => {
      if (acc == null || typeof acc !== "object") return undefined
      return (acc as Record<string, unknown>)[part]
    }, obj)
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split(".")
    let current: Record<string, unknown> = obj

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (typeof current[key] !== "object" || current[key] == null) {
        current[key] = {}
      }
      current = current[key] as Record<string, unknown>
    }

    current[keys[keys.length - 1]] = value
  }

  private parseJsonFields(message: Record<string, unknown>, paths: string[]): void {
    paths.forEach((path) => {
      const value = this.getNestedValue(message, path)
      if (typeof value !== "string") return
      const trimmed = value.trim()
      if (!trimmed) return
      try {
        this.setNestedValue(message, path, JSON.parse(trimmed))
      } catch {
        throw new Error(`字段 ${path} 不是合法 JSON`)
      }
    })
  }

  private normalizeNumberField(message: Record<string, unknown>, path: string): void {
    const value = this.getNestedValue(message, path)
    if (typeof value === "number") return
    if (typeof value !== "string") return
    const trimmed = value.trim()
    if (!trimmed) return
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return
    this.setNestedValue(message, path, Number(trimmed))
  }

  private normalizeMessage(message: WecomAppMessage, agentId: string): WecomAppMessage {
    const normalized = JSON.parse(JSON.stringify(message)) as Record<string, unknown>

    const jsonFieldPaths = [
      "news.articles",
      "mpnews.articles",
      "miniprogram_notice.content_item",
      "template_card.source",
      "template_card.action_menu",
      "template_card.quote_area",
      "template_card.emphasis_content",
      "template_card.horizontal_content_list",
      "template_card.jump_list",
      "template_card.card_action",
      "template_card.image_text_area",
      "template_card.card_image",
      "template_card.vertical_content_list",
      "template_card.button_selection",
      "template_card.button_list",
      "template_card.checkbox",
      "template_card.select_list",
      "template_card.submit_button",
    ]
    this.parseJsonFields(normalized, jsonFieldPaths)

    const numberFieldPaths = [
      "safe",
      "enable_id_trans",
      "enable_duplicate_check",
      "duplicate_check_interval",
    ]
    numberFieldPaths.forEach((path) => this.normalizeNumberField(normalized, path))

    const parsedAgentId = Number.parseInt(agentId, 10)
    if (!Number.isFinite(parsedAgentId)) {
      throw new Error("应用 AgentId 配置无效")
    }

    const msgtype = normalized.msgtype as string | undefined
    const hasReceiver = !!normalized.touser || !!normalized.toparty || !!normalized.totag
    if (!hasReceiver) {
      if (msgtype === "miniprogram_notice") {
        throw new Error("小程序通知消息不支持 @all，请至少填写 touser/toparty/totag 之一")
      }
      normalized.touser = "@all"
    }

    normalized.agentid = parsedAgentId
    return normalized as WecomAppMessage
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

    const normalizedMessage = this.normalizeMessage(message, agentId)

    console.log('sendWecomAppMessage:', {
      hasProxy: !!socks5Proxy,
      corpId,
      agentId,
    })

    // 获取 access_token
    const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`

    let tokenData: WecomTokenResponse

    // 真正的 HTTP 代理逻辑 (fetchViaHttpProxy) 或 Vercel Relay 逻辑
    if (socks5Proxy) {
      // 检查是否是 Relay 模式 (relay://)
      if (socks5Proxy.startsWith('relay://')) {
        const relayUrl = socks5Proxy.replace('relay://', 'https://')
        console.log('通过 Vercel Relay 发送消息:', relayUrl)

        try {
          const relayResponse = await fetch(relayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUrl: tokenUrl, // 这里其实是获取 token，下面还要发送消息
              method: 'GET'
              // proxyUrl: 如果不传，Vercel 侧会用 DEFAULT_PROXY_URL
            })
          })

          if (!relayResponse.ok) {
            const errText = await relayResponse.text()
            throw new Error(`Relay 服务报错: ${relayResponse.status} ${errText}`)
          }

          tokenData = await relayResponse.json() as WecomTokenResponse
        } catch (error) {
          console.error('Relay 请求失败:', error)
          throw new Error(`Relay 请求失败: ${error}`)
        }
      } else {
        // 标准 HTTP 代理模式
        console.log('通过 HTTP 代理获取 access_token')
        try {
          const tokenResponse = await fetchViaHttpProxy(socks5Proxy, tokenUrl)
          tokenData = await tokenResponse.json() as WecomTokenResponse
        } catch (error) {
          console.error('代理请求失败:', error)
          throw new Error(`代理请求失败: ${error}`)
        }
      }

      console.log('Token response:', tokenData)

      if (tokenData.errcode !== 0 || !tokenData.access_token) {
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
    const messageBody = JSON.stringify(normalizedMessage)

    let sendData: WecomSendResponse

    if (socks5Proxy) {
      if (socks5Proxy.startsWith('relay://')) {
        const relayUrl = socks5Proxy.replace('relay://', 'https://')
        console.log('通过 Vercel Relay 发送消息')

        try {
          const relayResponse = await fetch(relayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUrl: sendUrl,
              method: 'POST',
              body: JSON.parse(messageBody), // Relay 期望 JSON body 对象
              headers: { 'Content-Type': 'application/json' }
            })
          })

          if (!relayResponse.ok) {
            const errText = await relayResponse.text()
            throw new Error(`Relay 服务报错: ${relayResponse.status} ${errText}`)
          }

          sendData = await relayResponse.json() as WecomSendResponse
        } catch (error) {
          console.error('Relay 发送失败:', error)
          throw new Error(`Relay 发送失败: ${error}`)
        }
      } else {
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
