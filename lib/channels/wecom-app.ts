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
  { key: "touser", description: "成员ID，多个使用 | 分隔（留空默认 @all，小程序通知除外）" },
  { key: "toparty", description: "部门ID，多个使用 | 分隔" },
  { key: "totag", description: "标签ID，多个使用 | 分隔" },
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

function buildNewsArticleFields(maxArticles: number): TemplateField[] {
  const fields: TemplateField[] = []
  for (let i = 0; i < maxArticles; i++) {
    const idx = i + 1
    const required = i === 0
    fields.push(
      { key: `news.articles.${i}.title`, description: `第${idx}条标题`, required },
      { key: `news.articles.${i}.description`, description: `第${idx}条描述` },
      { key: `news.articles.${i}.url`, description: `第${idx}条链接 URL（与小程序二选一）` },
      { key: `news.articles.${i}.picurl`, description: `第${idx}条图片 URL` },
      { key: `news.articles.${i}.appid`, description: `第${idx}条小程序 appid` },
      { key: `news.articles.${i}.pagepath`, description: `第${idx}条小程序 pagepath` }
    )
  }
  return fields
}

function buildMpnewsArticleFields(maxArticles: number): TemplateField[] {
  const fields: TemplateField[] = []
  for (let i = 0; i < maxArticles; i++) {
    const idx = i + 1
    const required = i === 0
    fields.push(
      { key: `mpnews.articles.${i}.title`, description: `第${idx}条标题`, required },
      {
        key: `mpnews.articles.${i}.thumb_media_id`,
        description: `第${idx}条封面 media_id`,
        required,
        component: "wecom_media_upload",
        mediaType: "image",
        accept: "image/*",
      },
      { key: `mpnews.articles.${i}.author`, description: `第${idx}条作者` },
      { key: `mpnews.articles.${i}.content_source_url`, description: `第${idx}条原文链接` },
      { key: `mpnews.articles.${i}.content`, description: `第${idx}条正文(支持HTML)`, required, component: "textarea" },
      { key: `mpnews.articles.${i}.digest`, description: `第${idx}条摘要` }
    )
  }
  return fields
}

function buildMiniProgramContentFields(maxItems: number): TemplateField[] {
  const fields: TemplateField[] = []
  for (let i = 0; i < maxItems; i++) {
    const idx = i + 1
    fields.push(
      { key: `miniprogram_notice.content_item.${i}.key`, description: `内容项${idx}-键` },
      { key: `miniprogram_notice.content_item.${i}.value`, description: `内容项${idx}-值` }
    )
  }
  return fields
}

const TEMPLATE_CARD_SHARED_FIELDS: TemplateField[] = [
  { key: "template_card.source.icon_url", description: "来源图标 URL" },
  { key: "template_card.source.desc", description: "来源描述" },
  {
    key: "template_card.source.desc_color",
    description: "来源文字颜色",
    component: "select",
    defaultValue: "0",
    options: [
      { value: "0", label: "灰色" },
      { value: "1", label: "黑色" },
      { value: "2", label: "红色" },
      { value: "3", label: "绿色" },
    ],
  },
  { key: "template_card.action_menu.desc", description: "右上角菜单描述" },
  { key: "template_card.action_menu.action_list.0.text", description: "菜单1文本" },
  { key: "template_card.action_menu.action_list.0.key", description: "菜单1 key" },
  { key: "template_card.action_menu.action_list.1.text", description: "菜单2文本" },
  { key: "template_card.action_menu.action_list.1.key", description: "菜单2 key" },
  { key: "template_card.action_menu.action_list.2.text", description: "菜单3文本" },
  { key: "template_card.action_menu.action_list.2.key", description: "菜单3 key" },
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
          { key: "text.content", description: "消息内容", required: true, component: "textarea" },
          ...RECIPIENT_FIELDS,
          SAFE_FIELD,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "text" },
        ],
      },
      {
        type: "image",
        name: "图片消息",
        description: "支持直接上传图片素材并自动填写 media_id",
        fields: [
          {
            key: "image.media_id",
            description: "图片 media_id",
            required: true,
            component: "wecom_media_upload",
            mediaType: "image",
            accept: "image/*",
          },
          ...RECIPIENT_FIELDS,
          SAFE_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "image" },
        ],
      },
      {
        type: "voice",
        name: "语音消息",
        description: "支持直接上传语音素材并自动填写 media_id",
        fields: [
          {
            key: "voice.media_id",
            description: "语音 media_id",
            required: true,
            component: "wecom_media_upload",
            mediaType: "voice",
            accept: "audio/*",
          },
          ...RECIPIENT_FIELDS,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "voice" },
        ],
      },
      {
        type: "video",
        name: "视频消息",
        description: "支持直接上传视频素材并自动填写 media_id",
        fields: [
          {
            key: "video.media_id",
            description: "视频 media_id",
            required: true,
            component: "wecom_media_upload",
            mediaType: "video",
            accept: "video/*",
          },
          { key: "video.title", description: "视频标题" },
          { key: "video.description", description: "视频描述", component: "textarea" },
          ...RECIPIENT_FIELDS,
          SAFE_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "video" },
        ],
      },
      {
        type: "file",
        name: "文件消息",
        description: "支持直接上传文件素材并自动填写 media_id",
        fields: [
          {
            key: "file.media_id",
            description: "文件 media_id",
            required: true,
            component: "wecom_media_upload",
            mediaType: "file",
            accept: ".txt,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.xml,.jpg,.jpeg,.png,.bmp,.gif,.zip,.rar,.7z",
          },
          ...RECIPIENT_FIELDS,
          SAFE_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "file" },
        ],
      },
      {
        type: "markdown",
        name: "Markdown消息",
        description: "支持 markdown 子集",
        fields: [
          { key: "markdown.content", description: "Markdown 内容", required: true, component: "textarea" },
          ...RECIPIENT_FIELDS,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "markdown" },
        ],
      },
      {
        type: "textcard",
        name: "文本卡片消息",
        description: "文本卡片，可展示更丰富内容",
        fields: [
          { key: "textcard.title", description: "标题", required: true },
          { key: "textcard.description", description: "描述（支持 div/br）", required: true, component: "textarea" },
          { key: "textcard.url", description: "跳转 URL", required: true },
          { key: "textcard.btntxt", description: "按钮文字" },
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "textcard" },
        ],
      },
      {
        type: "news",
        name: "图文消息（news）",
        description: "可直接填写最多8条图文字段，无需JSON",
        fields: [
          ...buildNewsArticleFields(8),
          ...RECIPIENT_FIELDS,
          ENABLE_ID_TRANS_FIELD,
          ...DUPLICATE_FIELDS,
          { key: "msgtype", component: "hidden", defaultValue: "news" },
        ],
      },
      {
        type: "mpnews",
        name: "图文消息（mpnews）",
        description: "可直接填写最多8条图文字段，无需JSON",
        fields: [
          ...buildMpnewsArticleFields(8),
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
        description: "可直接填写内容项，无需JSON；不支持 @all",
        fields: [
          { key: "miniprogram_notice.appid", description: "小程序 AppID", required: true },
          { key: "miniprogram_notice.page", description: "跳转页面" },
          { key: "miniprogram_notice.title", description: "标题", required: true },
          { key: "miniprogram_notice.description", description: "描述" },
          { key: "miniprogram_notice.emphasis_first_item", description: "是否放大首项", component: "checkbox" },
          ...buildMiniProgramContentFields(10),
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
          { key: "template_card.main_title.title", description: "主标题" },
          { key: "template_card.main_title.desc", description: "主标题辅助信息" },
          { key: "template_card.sub_title_text", description: "二级文本", component: "textarea" },
          {
            key: "template_card.quote_area.type",
            description: "引用区跳转类型",
            component: "select",
            defaultValue: "0",
            options: [
              { value: "0", label: "无跳转" },
              { value: "1", label: "URL" },
              { value: "2", label: "小程序" },
            ],
          },
          { key: "template_card.quote_area.url", description: "引用区 URL" },
          { key: "template_card.quote_area.appid", description: "引用区小程序 appid" },
          { key: "template_card.quote_area.pagepath", description: "引用区小程序 pagepath" },
          { key: "template_card.quote_area.title", description: "引用区标题" },
          { key: "template_card.quote_area.quote_text", description: "引用区文案" },
          { key: "template_card.emphasis_content.title", description: "关键数据-值" },
          { key: "template_card.emphasis_content.desc", description: "关键数据-说明" },
          {
            key: "template_card.horizontal_content_list",
            description: "横向内容列表（高级JSON，可选）",
            component: "textarea",
            placeholder: '[{"keyname":"邀请人","value":"张三"}]',
          },
          {
            key: "template_card.jump_list",
            description: "跳转列表（高级JSON，可选）",
            component: "textarea",
            placeholder: '[{"type":1,"title":"企业微信官网","url":"https://work.weixin.qq.com"}]',
          },
          {
            key: "template_card.card_action.type",
            description: "卡片点击类型",
            required: true,
            component: "select",
            defaultValue: "1",
            options: [
              { value: "1", label: "URL" },
              { value: "2", label: "小程序" },
            ],
          },
          { key: "template_card.card_action.url", description: "卡片点击 URL" },
          { key: "template_card.card_action.appid", description: "卡片点击小程序 appid" },
          { key: "template_card.card_action.pagepath", description: "卡片点击小程序 pagepath" },
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
          { key: "template_card.main_title.desc", description: "主标题辅助信息" },
          {
            key: "template_card.image_text_area.type",
            description: "左图右文跳转类型",
            component: "select",
            defaultValue: "0",
            options: [
              { value: "0", label: "无跳转" },
              { value: "1", label: "URL" },
              { value: "2", label: "小程序" },
            ],
          },
          { key: "template_card.image_text_area.url", description: "左图右文 URL" },
          { key: "template_card.image_text_area.appid", description: "左图右文小程序 appid" },
          { key: "template_card.image_text_area.pagepath", description: "左图右文小程序 pagepath" },
          { key: "template_card.image_text_area.title", description: "左图右文标题" },
          { key: "template_card.image_text_area.desc", description: "左图右文描述" },
          { key: "template_card.image_text_area.image_url", description: "左图右文图片 URL" },
          { key: "template_card.card_image.url", description: "主图 URL" },
          { key: "template_card.card_image.aspect_ratio", description: "主图宽高比（1.3~2.25）" },
          {
            key: "template_card.vertical_content_list",
            description: "纵向内容列表（高级JSON，可选）",
            component: "textarea",
            placeholder: '[{"title":"二级标题","desc":"二级描述"}]',
          },
          {
            key: "template_card.horizontal_content_list",
            description: "横向内容列表（高级JSON，可选）",
            component: "textarea",
            placeholder: '[{"keyname":"邀请人","value":"张三"}]',
          },
          {
            key: "template_card.jump_list",
            description: "跳转列表（高级JSON，可选）",
            component: "textarea",
            placeholder: '[{"type":1,"title":"企业微信官网","url":"https://work.weixin.qq.com"}]',
          },
          {
            key: "template_card.card_action.type",
            description: "卡片点击类型",
            required: true,
            component: "select",
            defaultValue: "1",
            options: [
              { value: "1", label: "URL" },
              { value: "2", label: "小程序" },
            ],
          },
          { key: "template_card.card_action.url", description: "卡片点击 URL" },
          { key: "template_card.card_action.appid", description: "卡片点击小程序 appid" },
          { key: "template_card.card_action.pagepath", description: "卡片点击小程序 pagepath" },
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
          { key: "template_card.main_title.desc", description: "主标题辅助信息" },
          { key: "template_card.sub_title_text", description: "二级文本", component: "textarea" },
          {
            key: "template_card.horizontal_content_list",
            description: "横向内容列表（高级JSON，可选）",
            component: "textarea",
            placeholder: '[{"keyname":"邀请人","value":"张三"}]',
          },
          {
            key: "template_card.card_action.type",
            description: "卡片点击类型",
            component: "select",
            defaultValue: "0",
            options: [
              { value: "0", label: "无跳转" },
              { value: "1", label: "URL" },
              { value: "2", label: "小程序" },
            ],
          },
          { key: "template_card.card_action.url", description: "卡片点击 URL" },
          { key: "template_card.card_action.appid", description: "卡片点击小程序 appid" },
          { key: "template_card.card_action.pagepath", description: "卡片点击小程序 pagepath" },
          {
            key: "template_card.button_selection",
            description: "下拉选择器（高级JSON，可选）",
            component: "textarea",
            placeholder: '{"question_key":"q1","title":"评分","option_list":[{"id":"a","text":"100分"}]}'
          },
          {
            key: "template_card.button_list",
            description: "按钮列表（高级JSON，必填）",
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
          { key: "template_card.source.icon_url", description: "来源图标 URL" },
          { key: "template_card.source.desc", description: "来源描述" },
          { key: "template_card.main_title.title", description: "主标题", required: true },
          { key: "template_card.main_title.desc", description: "主标题辅助信息" },
          { key: "template_card.task_id", description: "任务ID（必填）", required: true },
          {
            key: "template_card.checkbox",
            description: "投票选项（高级JSON，必填）",
            required: true,
            component: "textarea",
            placeholder: '{"question_key":"q1","mode":1,"option_list":[{"id":"o1","text":"选项1","is_checked":true}]}'
          },
          { key: "template_card.submit_button.text", description: "提交按钮文案", required: true },
          { key: "template_card.submit_button.key", description: "提交按钮 key", required: true },
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
          { key: "template_card.source.icon_url", description: "来源图标 URL" },
          { key: "template_card.source.desc", description: "来源描述" },
          { key: "template_card.main_title.title", description: "主标题", required: true },
          { key: "template_card.main_title.desc", description: "主标题辅助信息" },
          { key: "template_card.task_id", description: "任务ID（必填）", required: true },
          {
            key: "template_card.select_list",
            description: "多项选择器（高级JSON，必填）",
            required: true,
            component: "textarea",
            placeholder: '[{"question_key":"q1","title":"标签1","option_list":[{"id":"s1","text":"选项1"}]}]'
          },
          { key: "template_card.submit_button.text", description: "提交按钮文案", required: true },
          { key: "template_card.submit_button.key", description: "提交按钮 key", required: true },
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

  private convertIndexedObjectToArray(input: unknown): unknown {
    if (Array.isArray(input)) {
      return input.map((item) => this.convertIndexedObjectToArray(item))
    }

    if (input == null || typeof input !== "object") {
      return input
    }

    const obj = input as Record<string, unknown>
    const keys = Object.keys(obj)
    const normalizedObject: Record<string, unknown> = {}
    keys.forEach((key) => {
      normalizedObject[key] = this.convertIndexedObjectToArray(obj[key])
    })

    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      const arr: unknown[] = []
      keys
        .map((k) => Number.parseInt(k, 10))
        .sort((a, b) => a - b)
        .forEach((idx) => {
          arr[idx] = normalizedObject[String(idx)]
        })
      return arr
    }

    return normalizedObject
  }

  private pruneEmpty(input: unknown): unknown {
    if (input === undefined || input === null) return undefined

    if (typeof input === "string") {
      const trimmed = input.trim()
      return trimmed === "" ? undefined : input
    }

    if (Array.isArray(input)) {
      const arr = input
        .map((item) => this.pruneEmpty(item))
        .filter((item) => item !== undefined)
      return arr.length === 0 ? undefined : arr
    }

    if (typeof input === "object") {
      const obj = input as Record<string, unknown>
      const output: Record<string, unknown> = {}
      Object.entries(obj).forEach(([key, value]) => {
        const normalizedValue = this.pruneEmpty(value)
        if (normalizedValue !== undefined) {
          output[key] = normalizedValue
        }
      })
      return Object.keys(output).length === 0 ? undefined : output
    }

    return input
  }

  private normalizeMessage(message: WecomAppMessage, agentId: string): WecomAppMessage {
    const normalized = JSON.parse(JSON.stringify(message)) as Record<string, unknown>

    const jsonFieldPaths = [
      "template_card.horizontal_content_list",
      "template_card.jump_list",
      "template_card.vertical_content_list",
      "template_card.button_selection",
      "template_card.button_list",
      "template_card.checkbox",
      "template_card.select_list",
    ]
    this.parseJsonFields(normalized, jsonFieldPaths)

    const converted = this.convertIndexedObjectToArray(normalized)
    const pruned = (this.pruneEmpty(converted) as Record<string, unknown>) || {}

    const numberFieldPaths = [
      "safe",
      "enable_id_trans",
      "enable_duplicate_check",
      "duplicate_check_interval",
      "template_card.source.desc_color",
      "template_card.quote_area.type",
      "template_card.image_text_area.type",
      "template_card.card_action.type",
      "template_card.card_image.aspect_ratio",
    ]
    numberFieldPaths.forEach((path) => this.normalizeNumberField(pruned, path))

    const parsedAgentId = Number.parseInt(agentId, 10)
    if (!Number.isFinite(parsedAgentId)) {
      throw new Error("应用 AgentId 配置无效")
    }

    const msgtype = pruned.msgtype as string | undefined
    const hasReceiver = !!pruned.touser || !!pruned.toparty || !!pruned.totag
    if (!hasReceiver) {
      if (msgtype === "miniprogram_notice") {
        throw new Error("小程序通知消息不支持 @all，请至少填写 touser/toparty/totag 之一")
      }
      pruned.touser = "@all"
    }

    pruned.agentid = parsedAgentId
    return pruned as WecomAppMessage
  }

  async sendMessage(message: WecomAppMessage, options: SendMessageOptions): Promise<Response> {
    const { corpId, agentId, secret, socks5Proxy } = options

    if (!corpId || !agentId || !secret) {
      throw new Error("缺少必要的配置信息")
    }

    const normalizedMessage = this.normalizeMessage(message, agentId)

    const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`

    let tokenData: WecomTokenResponse

    if (socks5Proxy) {
      if (socks5Proxy.startsWith("relay://")) {
        const relayUrl = socks5Proxy.replace("relay://", "https://")

        const relayResponse = await fetch(relayUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUrl: tokenUrl, method: "GET" }),
        })

        if (!relayResponse.ok) {
          const errText = await relayResponse.text()
          throw new Error(`Relay 服务报错: ${relayResponse.status} ${errText}`)
        }

        tokenData = await relayResponse.json() as WecomTokenResponse
      } else {
        const tokenResponse = await fetchViaHttpProxy(socks5Proxy, tokenUrl)
        tokenData = await tokenResponse.json() as WecomTokenResponse
      }

      if (tokenData.errcode !== 0 || !tokenData.access_token) {
        throw new Error(`获取访问令牌失败: ${tokenData.errmsg || "未知错误"}`)
      }
    } else {
      const tokenResponse = await fetch(tokenUrl)
      tokenData = await tokenResponse.json() as WecomTokenResponse

      if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(`获取访问令牌失败: ${tokenData.errmsg}`)
      }
    }

    const sendUrl = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`
    const messageBody = JSON.stringify(normalizedMessage)

    let sendData: WecomSendResponse

    if (socks5Proxy) {
      if (socks5Proxy.startsWith("relay://")) {
        const relayUrl = socks5Proxy.replace("relay://", "https://")

        const relayResponse = await fetch(relayUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUrl: sendUrl,
            method: "POST",
            body: JSON.parse(messageBody),
            headers: { "Content-Type": "application/json" },
          }),
        })

        if (!relayResponse.ok) {
          const errText = await relayResponse.text()
          throw new Error(`Relay 服务报错: ${relayResponse.status} ${errText}`)
        }

        sendData = await relayResponse.json() as WecomSendResponse
      } else {
        const sendResponse = await fetchViaHttpProxy(socks5Proxy, sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: messageBody,
        })
        sendData = await sendResponse.json() as WecomSendResponse
      }
    } else {
      const response = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: messageBody,
      })
      sendData = await response.json() as WecomSendResponse
    }

    if (sendData.errcode !== 0) {
      throw new Error(`企业微信应用消息推送失败: ${sendData.errmsg}`)
    }

    return new Response(JSON.stringify(sendData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
}
