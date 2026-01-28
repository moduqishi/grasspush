"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { UseFormReturn } from "react-hook-form"
import type { ChannelFormData } from "@/lib/db/schema/channels"

interface WecomAppFieldsProps {
  form: UseFormReturn<ChannelFormData>
}

export function WecomAppFields({ form }: WecomAppFieldsProps) {
  return (
    <>
      <FormField
        control={form.control}
        name="corpId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>企业ID (corpId)
              <span className="text-red-500 ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Input placeholder="请输入企业微信的企业ID" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="agentId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>应用ID (agentId)
              <span className="text-red-500 ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Input placeholder="请输入企业微信应用的AgentId" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="secret"
        render={({ field }) => (
          <FormItem>
            <FormLabel>应用Secret
              <span className="text-red-500 ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder="请输入企业微信应用的Secret"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 域名验证配置 */}
      <div className="border-t pt-4 mt-4">
        <h4 className="text-sm font-medium mb-3 text-muted-foreground">可信域名验证（可选）</h4>
        <FormField
          control={form.control}
          name="wecomVerifyFilename"
          render={({ field }) => (
            <FormItem>
              <FormLabel>验证文件名</FormLabel>
              <FormControl>
                <Input
                  placeholder="如: WW_verify_abc123def"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                企业微信提供的验证文件名，不需要 .txt 后缀
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="wecomVerifyContent"
          render={({ field }) => (
            <FormItem className="mt-3">
              <FormLabel>验证文件内容</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="粘贴企业微信提供的验证文件内容"
                  className="min-h-[80px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* SOCKS5 代理配置 */}
      <div className="border-t pt-4 mt-4">
        <h4 className="text-sm font-medium mb-3 text-muted-foreground">SOCKS5 代理（可选）</h4>
        <FormField
          control={form.control}
          name="socks5Proxy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>代理地址</FormLabel>
              <FormControl>
                <Input
                  placeholder="socks5://user:pass@host:port 或 socks5://host:port"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                配置后将通过代理发送请求，用于满足企业微信可信 IP 要求
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  )
}
