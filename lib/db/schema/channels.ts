import { sql } from "drizzle-orm"
import { text, sqliteTable, index } from "drizzle-orm/sqlite-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"
import { z } from "zod"
import { CHANNEL_TYPES } from "@/lib/channels"

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: Object.values(CHANNEL_TYPES) as [string, ...string[]] }).notNull(),
  webhook: text("webhook"),
  secret: text("secret"),
  corpId: text("corp_id"),
  agentId: text("agent_id"),
  botToken: text("bot_token"),
  chatId: text("chat_id"),
  // 企业微信域名验证
  wecomVerifyFilename: text("wecom_verify_filename"),
  wecomVerifyContent: text("wecom_verify_content"),
  // SOCKS5 代理配置 (格式: socks5://user:pass@host:port 或 socks5://host:port)
  socks5Proxy: text("socks5_proxy"),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userIdIdx: index("channels_user_id_idx").on(table.userId),
}))

export const insertChannelSchema = createInsertSchema(channels).extend({
  name: z.string().min(1, "名称不能为空").max(50, "名称不能超过50个字符"),
  type: z.nativeEnum(CHANNEL_TYPES),
  webhook: z.string().optional(),
  secret: z.string().optional(),
  corpId: z.string().optional(),
  agentId: z.string().optional(),
  userId: z.string().optional(),
  id: z.string().optional(),
  botToken: z.string().optional(),
  chatId: z.string().optional(),
  wecomVerifyFilename: z.string().optional(),
  wecomVerifyContent: z.string().optional(),
  socks5Proxy: z.string().optional(),
}).refine((data) => {
  if (data.type === CHANNEL_TYPES.WECOM_APP) {
    return !!data.corpId
  }
  return true
}, {
  message: "企业微信应用必须提供企业ID",
  path: ["corpId"],
}).refine((data) => {
  if (data.type === CHANNEL_TYPES.WECOM_APP) {
    return !!data.agentId
  }
  return true
}, {
  message: "企业微信应用必须提供应用ID",
  path: ["agentId"],
}).refine((data) => {
  if (data.type === CHANNEL_TYPES.WECOM_APP) {
    return !!data.secret
  }
  return true
}, {
  message: "企业微信应用必须提供应用Secret",
  path: ["secret"],
}).refine((data) => {
  if (![CHANNEL_TYPES.WECOM_APP, CHANNEL_TYPES.TELEGRAM, CHANNEL_TYPES.FEISHU, CHANNEL_TYPES.BARK, CHANNEL_TYPES.WEBHOOK].includes(data.type as any)) {
    if (!data.webhook) return false
    try {
      new URL(data.webhook)
      return true
    } catch {
      return false
    }
  }
  return true
}, {
  message: "请输入有效的 Webhook 地址",
  path: ["webhook"],
}).refine((data) => {
  if (data.type === CHANNEL_TYPES.WEBHOOK) {
    if (!data.webhook) return false
    try {
      new URL(data.webhook)
      return true
    } catch {
      return false
    }
  }
  return true
}, {
  message: "通用 Webhook 必须提供有效的 URL 地址",
  path: ["webhook"],
}).refine((data) => {
  if (data.type === CHANNEL_TYPES.FEISHU) {
    if (!data.webhook) return false
    try {
      new URL(data.webhook)
      return true
    } catch {
      return false
    }
  }
  return true
}, {
  message: "飞书机器人必须提供有效的 Webhook 地址",
  path: ["webhook"],
}).refine((data) => {
  if (data.type === CHANNEL_TYPES.BARK) {
    if (!data.webhook) return false
    try {
      new URL(data.webhook)
      return true
    } catch {
      return false
    }
  }
  return true
}, {
  message: "Bark 必须提供有效的服务器地址",
  path: ["webhook"],
}).refine((data) => {
  if (data.type === CHANNEL_TYPES.TELEGRAM) {
    return !!data.botToken
  }
  return true
}, {
  message: "Telegram 机器人必须提供 Bot Token",
  path: ["botToken"],
}).refine((data) => {
  if (data.type === CHANNEL_TYPES.TELEGRAM) {
    return !!data.chatId
  }
  return true
}, {
  message: "Telegram 机器人必须提供 Chat ID",
  path: ["chatId"],
})

export const selectChannelSchema = createSelectSchema(channels)

export type Channel = typeof channels.$inferSelect
export type ChannelFormData = z.infer<typeof insertChannelSchema> 