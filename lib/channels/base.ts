export interface TemplateField {
  key: string
  description?: string
  placeholder?: string
  required?: boolean
  component?: 'input' | 'textarea' | 'checkbox' | 'select' | 'hidden' | 'wecom_media_upload'
  defaultValue?: string
  options?: Array<{value: string, label: string}>
  mediaType?: 'image' | 'voice' | 'video' | 'file'
  accept?: string
}

export interface MessageTemplate {
  type: string
  name: string
  description: string
  fields: TemplateField[]
}

export interface ChannelConfig {
  type: string
  label: string
  templates: MessageTemplate[]
}

export interface SendMessageOptions {
  webhook?: string
  secret?: string
  corpId?: string
  agentId?: string
  botToken?: string
  chatId?: string
  [key: string]: any
}

export abstract class BaseChannel {
  abstract readonly config: ChannelConfig
  
  abstract sendMessage(message: any, options: SendMessageOptions): Promise<Response>
  
  getTemplates(): MessageTemplate[] {
    return this.config.templates
  }
  
  getLabel(): string {
    return this.config.label
  }
  
  getType(): string {
    return this.config.type
  }
} 
