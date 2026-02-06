"use client"

import { useEffect, useId, useRef, useState } from "react"
import { UseFormReturn } from "react-hook-form"
import { ChevronDown, ChevronUp, Loader2, Upload } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
  FormControl,
  FormItem,
  FormLabel,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { FunctionSelector } from "@/components/function-selector"
import { MessageTemplate, TemplateField } from "@/lib/channels/base"
import { getNestedValue, setNestedValue } from "@/lib/utils"

interface TemplateFieldsProps {
  form: UseFormReturn<any>
  template: MessageTemplate
}

function WecomMediaUploadInput({
  field,
  value,
  onChange,
  channelId,
}: {
  field: TemplateField
  value: any
  onChange: (value: any) => void
  channelId?: string
}) {
  const fileInputId = useId()
  const fileInputHelpId = `${fileInputId}-help`
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [fileName, setFileName] = useState("")
  const { toast } = useToast()

  async function uploadMedia(file: File) {
    if (!channelId) {
      toast({
        variant: "destructive",
        description: "Please select a channel before uploading media.",
      })
      return
    }

    if (!field.mediaType) {
      toast({
        variant: "destructive",
        description: "Field is missing mediaType configuration.",
      })
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("channelId", channelId)
      formData.append("mediaType", field.mediaType)
      formData.append("file", file)

      const response = await fetch("/api/wecom/media/upload", {
        method: "POST",
        body: formData,
      })

      const data = await response.json() as { message?: string; media_id?: string }
      if (!response.ok) {
        throw new Error(data.message || "Upload failed")
      }

      onChange(data.media_id || "")
      setFileName(file.name)
      toast({ description: "Media uploaded successfully. media_id has been filled in." })
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Upload failed",
      })
    } finally {
      setIsUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ""
      }
    }
  }

  return (
    <div className="space-y-2">
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || "Upload to auto-fill media_id, or enter it manually."}
      />
      <div className="flex items-center gap-2">
        <input
          id={fileInputId}
          ref={inputRef}
          type="file"
          accept={field.accept}
          className="sr-only"
          aria-label={`Upload media file${field.mediaType ? ` (${field.mediaType})` : ""}`}
          aria-describedby={fileInputHelpId}
          title="Upload media file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              uploadMedia(file)
            }
          }}
        />
        <span id={fileInputHelpId} className="sr-only">
          Select a local file to upload, then media_id will be filled automatically.
        </span>
        <Button asChild size="sm" variant="outline">
          <label
            htmlFor={fileInputId}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if (isUploading) {
                e.preventDefault()
              }
            }}
            onKeyDown={(e) => {
              if (isUploading) {
                e.preventDefault()
                return
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            className={isUploading ? "pointer-events-none opacity-50" : "cursor-pointer"}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload Media
          </label>
        </Button>
        {fileName && (
          <span className="max-w-[220px] truncate text-xs text-muted-foreground">
            {fileName}
          </span>
        )}
      </div>
    </div>
  )
}

function FieldComponent({
  field,
  value,
  onChange,
  channelId,
}: {
  field: TemplateField
  value: any
  onChange: (value: any) => void
  channelId?: string
}) {
  switch (field.component) {
    case "textarea":
      return (
        <Textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || `Please enter ${field.description || "content"}`}
          className="resize-none"
        />
      )
    case "checkbox":
      return <Checkbox checked={value || false} onCheckedChange={onChange} />
    case "select":
      return (
        <Select value={value || field.options?.[0]?.value || ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || `Please select ${field.description || "an option"}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case "wecom_media_upload":
      return (
        <WecomMediaUploadInput
          field={field}
          value={value}
          onChange={onChange}
          channelId={channelId}
        />
      )
    case "hidden":
      return null
    default:
      return (
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || `Please enter ${field.description || "content"}`}
        />
      )
  }
}

function isVariableSupported(field: TemplateField) {
  return field.component === "input" || field.component === "textarea" || !field.component
}

export function TemplateFields({ form, template }: TemplateFieldsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [prevType, setPrevType] = useState(template.type)
  const channelId = form.watch("channelId")
  const [fieldValues, setFieldValues] = useState<Record<string, any>>(() => {
    try {
      const rule = JSON.parse(form.getValues("rule") || "{}")
      const flattenedValues: Record<string, any> = {}
      template.fields.forEach((field) => {
        if (field.component === "hidden" && field.defaultValue !== undefined) {
          flattenedValues[field.key] = field.defaultValue
        } else {
          const v = getNestedValue(rule, field.key)
          if (v !== undefined) {
            flattenedValues[field.key] = v
          }
        }
      })
      return flattenedValues
    } catch {
      return {}
    }
  })

  const requiredFields = template.fields.filter((field) => field.required)
  const optionalFields = template.fields.filter((field) => !field.required && field.component !== "hidden")

  useEffect(() => {
    if (prevType !== template.type) {
      const newFieldValues: Record<string, any> = {}
      template.fields.forEach((field) => {
        if (field.component === "hidden" && field.defaultValue !== undefined) {
          newFieldValues[field.key] = field.defaultValue
          return
        }

        if (fieldValues[field.key] !== undefined) {
          newFieldValues[field.key] = fieldValues[field.key]
          return
        }

        if (field.defaultValue !== undefined) {
          newFieldValues[field.key] = field.defaultValue
        }
      })
      setFieldValues(newFieldValues)
      setPrevType(template.type)
    }
  }, [template.type, prevType, fieldValues, template.fields])

  useEffect(() => {
    const processedValues: Record<string, any> = {}
    Object.entries(fieldValues).forEach(([key, value]) => {
      if (key.includes(".")) {
        setNestedValue(processedValues, key, value)
      } else {
        processedValues[key] = value
      }
    })

    form.setValue("rule", JSON.stringify(processedValues, null, 2))
  }, [fieldValues, form])

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="mb-2 text-sm font-medium text-muted-foreground">Please fill in the fields below:</div>

      <div className="space-y-4">
        {requiredFields.map((field) => (
          <FormItem key={field.key}>
            <FormLabel className="flex items-center justify-between">
              <div>
                <span
                  className="[&_a]:text-blue-500 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: field.description || "" }}
                />
                <span className="ml-1 text-red-500">*</span>
              </div>
              {isVariableSupported(field) && (
                <FunctionSelector
                  onSelect={(insertValue) => {
                    setFieldValues((prev) => ({
                      ...prev,
                      [field.key]: (prev[field.key] || "") + insertValue,
                    }))
                  }}
                />
              )}
            </FormLabel>
            <FormControl>
              <FieldComponent
                field={field}
                value={fieldValues[field.key]}
                channelId={channelId}
                onChange={(nextValue) => {
                  setFieldValues((prev) => ({
                    ...prev,
                    [field.key]: nextValue,
                  }))
                }}
              />
            </FormControl>
          </FormItem>
        ))}
      </div>

      {optionalFields.length > 0 && (
        <div className="border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full justify-between px-2 hover:bg-muted"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span className="text-sm font-medium text-muted-foreground">Advanced Settings</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
              {optionalFields.map((field) => (
                <FormItem
                  key={field.key}
                  className={field.component === "checkbox" ? "flex items-center [&_button]:!ml-2 [&_button]:!mt-0" : ""}
                >
                  <FormLabel className="flex items-center justify-between">
                    <div>{field.description}</div>
                    {isVariableSupported(field) && (
                      <FunctionSelector
                        onSelect={(insertValue) => {
                          setFieldValues((prev) => ({
                            ...prev,
                            [field.key]: (prev[field.key] || "") + insertValue,
                          }))
                        }}
                      />
                    )}
                  </FormLabel>
                  <FormControl>
                    <FieldComponent
                      field={field}
                      value={fieldValues[field.key]}
                      channelId={channelId}
                      onChange={(nextValue) => {
                        setFieldValues((prev) => ({
                          ...prev,
                          [field.key]: nextValue,
                        }))
                      }}
                    />
                  </FormControl>
                </FormItem>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
