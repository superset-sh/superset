"use client"

import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  Music2Icon,
  PaperclipIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"
import type { ComponentProps, HTMLAttributes, ReactNode } from "react"
import { createContext, useContext, useMemo } from "react"
import { Button } from "../../_shadcn/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../_shadcn/hover-card"
import { cn } from "../../lib/utils"

// ============================================================================
// Types
// ============================================================================

export interface AttachmentData {
  id: string
  type: "file" | "source-document"
  filename?: string
  title?: string
  url?: string
  mediaType?: string
}

export type AttachmentMediaCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "source"
  | "unknown"

export type AttachmentVariant = "grid" | "inline" | "list"

// ============================================================================
// Utility Functions
// ============================================================================

export const getMediaCategory = (data: AttachmentData): AttachmentMediaCategory => {
  if (data.type === "source-document") {
    return "source"
  }

  const mediaType = data.mediaType ?? ""

  if (mediaType.startsWith("image/")) {
    return "image"
  }
  if (mediaType.startsWith("video/")) {
    return "video"
  }
  if (mediaType.startsWith("audio/")) {
    return "audio"
  }
  if (mediaType.startsWith("application/") || mediaType.startsWith("text/")) {
    return "document"
  }

  return "unknown"
}

export const getAttachmentLabel = (data: AttachmentData): string => {
  if (data.type === "source-document") {
    return data.title || data.filename || "Source"
  }

  const category = getMediaCategory(data)
  return data.filename || (category === "image" ? "Image" : "Attachment")
}

// ============================================================================
// Contexts
// ============================================================================

interface AttachmentsContextValue {
  variant: AttachmentVariant
}

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null)

interface AttachmentContextValue {
  data: AttachmentData
  mediaCategory: AttachmentMediaCategory
  onRemove?: () => void
  variant: AttachmentVariant
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null)

// ============================================================================
// Hooks
// ============================================================================

export const useAttachmentsContext = () =>
  useContext(AttachmentsContext) ?? { variant: "grid" as const }

export const useAttachmentContext = () => {
  const ctx = useContext(AttachmentContext)
  if (!ctx) {
    throw new Error("Attachment components must be used within <Attachment>")
  }
  return ctx
}

// ============================================================================
// Attachments - Container
// ============================================================================

export type AttachmentsProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AttachmentVariant
}

export const Attachments = ({
  variant = "grid",
  className,
  children,
  ...props
}: AttachmentsProps) => {
  const contextValue = useMemo(() => ({ variant }), [variant])

  return (
    <AttachmentsContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex items-start",
          variant === "list" ? "flex-col gap-2" : "flex-wrap gap-2",
          variant === "grid" && "ml-auto w-fit",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AttachmentsContext.Provider>
  )
}

// ============================================================================
// Attachment - Item
// ============================================================================

export type AttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: AttachmentData
  onRemove?: () => void
}

export const Attachment = ({ data, onRemove, className, children, ...props }: AttachmentProps) => {
  const { variant } = useAttachmentsContext()
  const mediaCategory = getMediaCategory(data)

  const contextValue = useMemo<AttachmentContextValue>(
    () => ({ data, mediaCategory, onRemove, variant }),
    [data, mediaCategory, onRemove, variant],
  )

  return (
    <AttachmentContext.Provider value={contextValue}>
      <div
        className={cn(
          "group relative",
          variant === "grid" && "size-24 overflow-hidden rounded-lg",
          variant === "inline" && [
            "flex h-8 cursor-pointer select-none items-center gap-1.5",
            "rounded-md border border-border px-1.5",
            "font-medium text-sm transition-all",
            "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
          ],
          variant === "list" && [
            "flex w-full items-center gap-3 rounded-lg border p-3",
            "hover:bg-accent/50",
          ],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AttachmentContext.Provider>
  )
}

// ============================================================================
// AttachmentPreview - Media preview
// ============================================================================

export type AttachmentPreviewProps = HTMLAttributes<HTMLDivElement> & {
  fallbackIcon?: ReactNode
}

export const AttachmentPreview = ({
  fallbackIcon,
  className,
  ...props
}: AttachmentPreviewProps) => {
  const { data, mediaCategory, variant } = useAttachmentContext()

  const iconSize = variant === "inline" ? "size-3" : "size-4"

  const renderImage = (url: string, filename: string | undefined, isGrid: boolean) =>
    isGrid ? (
      <img
        alt={filename || "Image"}
        className="size-full object-cover"
        height={96}
        src={url}
        width={96}
      />
    ) : (
      <img
        alt={filename || "Image"}
        className="size-full rounded object-cover"
        height={20}
        src={url}
        width={20}
      />
    )

  const renderIcon = (Icon: typeof ImageIcon) => (
    <Icon className={cn(iconSize, "text-muted-foreground")} />
  )

  const renderContent = () => {
    if (mediaCategory === "image" && data.type === "file" && data.url) {
      return renderImage(data.url, data.filename, variant === "grid")
    }

    if (mediaCategory === "video" && data.type === "file" && data.url) {
      return <video className="size-full object-cover" muted src={data.url} />
    }

    const iconMap: Record<AttachmentMediaCategory, typeof ImageIcon> = {
      image: ImageIcon,
      video: VideoIcon,
      audio: Music2Icon,
      source: GlobeIcon,
      document: FileTextIcon,
      unknown: PaperclipIcon,
    }

    const Icon = iconMap[mediaCategory]
    return fallbackIcon ?? renderIcon(Icon)
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        variant === "grid" && "size-full bg-muted",
        variant === "inline" && "size-5 rounded bg-background",
        variant === "list" && "size-12 rounded bg-muted",
        className,
      )}
      {...props}
    >
      {renderContent()}
    </div>
  )
}

// ============================================================================
// AttachmentInfo - Name and type display
// ============================================================================

export type AttachmentInfoProps = HTMLAttributes<HTMLDivElement> & {
  showMediaType?: boolean
}

export const AttachmentInfo = ({
  showMediaType = false,
  className,
  ...props
}: AttachmentInfoProps) => {
  const { data, variant } = useAttachmentContext()
  const label = getAttachmentLabel(data)

  if (variant === "grid") {
    return null
  }

  return (
    <div className={cn("min-w-0 flex-1", className)} {...props}>
      <span className="block truncate">{label}</span>
      {showMediaType && data.mediaType && (
        <span className="block truncate text-muted-foreground text-xs">{data.mediaType}</span>
      )}
    </div>
  )
}

// ============================================================================
// AttachmentRemove - Remove button
// ============================================================================

export type AttachmentRemoveProps = ComponentProps<typeof Button> & {
  label?: string
}

export const AttachmentRemove = ({
  label = "Remove",
  className,
  children,
  ...props
}: AttachmentRemoveProps) => {
  const { onRemove, variant } = useAttachmentContext()

  if (!onRemove) {
    return null
  }

  return (
    <Button
      aria-label={label}
      className={cn(
        variant === "grid" && [
          "absolute top-2 right-2 size-6 rounded-full p-0",
          "bg-background/80 backdrop-blur-sm",
          "opacity-0 transition-opacity group-hover:opacity-100",
          "hover:bg-background",
          "[&>svg]:size-3",
        ],
        variant === "inline" && [
          "size-5 rounded p-0",
          "opacity-0 transition-opacity group-hover:opacity-100",
          "[&>svg]:size-2.5",
        ],
        variant === "list" && ["size-8 shrink-0 rounded p-0", "[&>svg]:size-4"],
        className,
      )}
      onClick={e => {
        e.stopPropagation()
        onRemove()
      }}
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <XIcon />}
      <span className="sr-only">{label}</span>
    </Button>
  )
}

// ============================================================================
// AttachmentHoverCard - Hover preview
// ============================================================================

export type AttachmentHoverCardProps = ComponentProps<typeof HoverCard>

export const AttachmentHoverCard = ({
  openDelay = 0,
  closeDelay = 0,
  ...props
}: AttachmentHoverCardProps) => (
  <HoverCard closeDelay={closeDelay} openDelay={openDelay} {...props} />
)

export type AttachmentHoverCardTriggerProps = ComponentProps<typeof HoverCardTrigger>

export const AttachmentHoverCardTrigger = (props: AttachmentHoverCardTriggerProps) => (
  <HoverCardTrigger {...props} />
)

export type AttachmentHoverCardContentProps = ComponentProps<typeof HoverCardContent>

export const AttachmentHoverCardContent = ({
  align = "start",
  className,
  ...props
}: AttachmentHoverCardContentProps) => (
  <HoverCardContent align={align} className={cn("w-auto p-2", className)} {...props} />
)

// ============================================================================
// AttachmentEmpty - Empty state
// ============================================================================

export type AttachmentEmptyProps = HTMLAttributes<HTMLDivElement>

export const AttachmentEmpty = ({ className, children, ...props }: AttachmentEmptyProps) => (
  <div
    className={cn("flex items-center justify-center p-4 text-muted-foreground text-sm", className)}
    {...props}
  >
    {children ?? "No attachments"}
  </div>
)

/** Demo component for preview */
export default function AttachmentsDemo() {
  const imageAttachments: AttachmentData[] = [
    {
      id: "1",
      type: "file",
      filename: "photo-1.jpg",
      mediaType: "image/jpeg",
      url: "https://picsum.photos/seed/attach1/200/200",
    },
    {
      id: "2",
      type: "file",
      filename: "photo-2.jpg",
      mediaType: "image/jpeg",
      url: "https://picsum.photos/seed/attach2/200/200",
    },
    {
      id: "3",
      type: "file",
      filename: "landscape.png",
      mediaType: "image/png",
      url: "https://picsum.photos/seed/attach3/200/200",
    },
  ]

  const mixedAttachments: AttachmentData[] = [
    { id: "4", type: "file", filename: "report.pdf", mediaType: "application/pdf" },
    { id: "5", type: "file", filename: "podcast.mp3", mediaType: "audio/mpeg" },
    { id: "6", type: "file", filename: "demo.mp4", mediaType: "video/mp4" },
    { id: "7", type: "source-document", title: "API Documentation" },
  ]

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8 p-6">
      {/* Grid Variant - Image Gallery */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Grid Variant</h3>
          <span className="text-muted-foreground text-xs">Image thumbnails with remove button</span>
        </div>
        <Attachments variant="grid" className="ml-0 justify-start">
          {imageAttachments.map(attachment => (
            <Attachment
              key={attachment.id}
              data={attachment}
              onRemove={() => console.log("Remove", attachment.id)}
            >
              <AttachmentPreview />
              <AttachmentRemove />
            </Attachment>
          ))}
        </Attachments>
      </div>

      {/* Inline Variant - Compact Tags */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Inline Variant</h3>
          <span className="text-muted-foreground text-xs">Compact chips for mixed files</span>
        </div>
        <Attachments variant="inline" className="justify-start">
          {[...imageAttachments.slice(0, 1), ...mixedAttachments].map(attachment => (
            <Attachment
              key={attachment.id}
              data={attachment}
              onRemove={() => console.log("Remove", attachment.id)}
            >
              <AttachmentPreview />
              <AttachmentInfo />
              <AttachmentRemove />
            </Attachment>
          ))}
        </Attachments>
      </div>

      {/* List Variant - Detailed View */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">List Variant</h3>
          <span className="text-muted-foreground text-xs">Full details with media type</span>
        </div>
        <Attachments variant="list">
          {[imageAttachments[0], ...mixedAttachments.slice(0, 2)].map(attachment => (
            <Attachment
              key={attachment.id}
              data={attachment}
              onRemove={() => console.log("Remove", attachment.id)}
            >
              <AttachmentPreview />
              <AttachmentInfo showMediaType />
              <AttachmentRemove />
            </Attachment>
          ))}
        </Attachments>
      </div>
    </div>
  )
}
