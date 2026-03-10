"use client"

import { CheckIcon, CopyIcon, FileIcon, GitCommitIcon, MinusIcon, PlusIcon } from "lucide-react"
import { type ComponentProps, type HTMLAttributes, useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback } from "../../_shadcn/avatar"
import { Button } from "../../_shadcn/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../_shadcn/collapsible"
import { cn } from "../../lib/utils"

export type CommitProps = ComponentProps<typeof Collapsible>

export const Commit = ({ className, children, ...props }: CommitProps) => (
  <Collapsible className={cn("rounded-lg border bg-background", className)} {...props}>
    {children}
  </Collapsible>
)

export type CommitHeaderProps = ComponentProps<typeof CollapsibleTrigger>

export const CommitHeader = ({ className, children, ...props }: CommitHeaderProps) => (
  <CollapsibleTrigger {...props} render={<div className={cn(
            "group flex cursor-pointer items-center justify-between gap-4 p-3 text-left transition-colors hover:opacity-80",
            className,
          )} />}>{children}</CollapsibleTrigger>
)

export type CommitHashProps = HTMLAttributes<HTMLSpanElement>

export const CommitHash = ({ className, children, ...props }: CommitHashProps) => (
  <span className={cn("font-mono text-xs", className)} {...props}>
    <GitCommitIcon className="mr-1 inline-block size-3" />
    {children}
  </span>
)

export type CommitMessageProps = HTMLAttributes<HTMLSpanElement>

export const CommitMessage = ({ className, children, ...props }: CommitMessageProps) => (
  <span className={cn("font-medium text-sm", className)} {...props}>
    {children}
  </span>
)

export type CommitMetadataProps = HTMLAttributes<HTMLDivElement>

export const CommitMetadata = ({ className, children, ...props }: CommitMetadataProps) => (
  <div
    className={cn("flex items-center gap-2 text-muted-foreground text-xs", className)}
    {...props}
  >
    {children}
  </div>
)

export type CommitSeparatorProps = HTMLAttributes<HTMLSpanElement>

export const CommitSeparator = ({ className, children, ...props }: CommitSeparatorProps) => (
  <span className={className} {...props}>
    {children ?? "•"}
  </span>
)

export type CommitInfoProps = HTMLAttributes<HTMLDivElement>

export const CommitInfo = ({ className, children, ...props }: CommitInfoProps) => (
  <div className={cn("flex flex-1 flex-col", className)} {...props}>
    {children}
  </div>
)

export type CommitAuthorProps = HTMLAttributes<HTMLDivElement>

export const CommitAuthor = ({ className, children, ...props }: CommitAuthorProps) => (
  <div className={cn("flex items-center", className)} {...props}>
    {children}
  </div>
)

export type CommitAuthorAvatarProps = ComponentProps<typeof Avatar> & {
  initials: string
}

export const CommitAuthorAvatar = ({ initials, className, ...props }: CommitAuthorAvatarProps) => (
  <Avatar className={cn("size-8", className)} {...props}>
    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
  </Avatar>
)

export type CommitTimestampProps = HTMLAttributes<HTMLTimeElement> & {
  date: Date
}

export const CommitTimestamp = ({ date, className, children, ...props }: CommitTimestampProps) => {
  const formatted = new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    "day",
  )

  return (
    <time
      className={cn("text-xs", className)}
      dateTime={date.toISOString()}
      suppressHydrationWarning
      {...props}
    >
      {children ?? formatted}
    </time>
  )
}

export type CommitActionsProps = HTMLAttributes<HTMLDivElement>

export const CommitActions = ({ className, children, ...props }: CommitActionsProps) => (
  <div
    className={cn("flex items-center gap-1", className)}
    onClick={e => e.stopPropagation()}
    onKeyDown={e => e.stopPropagation()}
    role="group"
    {...props}
  >
    {children}
  </div>
)

export type CommitCopyButtonProps = ComponentProps<typeof Button> & {
  hash: string
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const CommitCopyButton = ({
  hash,
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CommitCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<number>(0)

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"))
      return
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(hash)
        setIsCopied(true)
        onCopy?.()
        timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout)
      }
    } catch (error) {
      onError?.(error as Error)
    }
  }

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  const Icon = isCopied ? CheckIcon : CopyIcon

  return (
    <Button
      className={cn("size-7 shrink-0", className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  )
}

export type CommitContentProps = ComponentProps<typeof CollapsibleContent>

export const CommitContent = ({ className, children, ...props }: CommitContentProps) => (
  <CollapsibleContent className={cn("border-t p-3", className)} {...props}>
    {children}
  </CollapsibleContent>
)

export type CommitFilesProps = HTMLAttributes<HTMLDivElement>

export const CommitFiles = ({ className, children, ...props }: CommitFilesProps) => (
  <div className={cn("space-y-1", className)} {...props}>
    {children}
  </div>
)

export type CommitFileProps = HTMLAttributes<HTMLDivElement>

export const CommitFile = ({ className, children, ...props }: CommitFileProps) => (
  <div
    className={cn(
      "flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50",
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export type CommitFileInfoProps = HTMLAttributes<HTMLDivElement>

export const CommitFileInfo = ({ className, children, ...props }: CommitFileInfoProps) => (
  <div className={cn("flex min-w-0 items-center gap-2", className)} {...props}>
    {children}
  </div>
)

const fileStatusStyles = {
  added: "text-green-600 dark:text-green-400",
  modified: "text-yellow-600 dark:text-yellow-400",
  deleted: "text-red-600 dark:text-red-400",
  renamed: "text-blue-600 dark:text-blue-400",
}

const fileStatusLabels = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
}

export type CommitFileStatusProps = HTMLAttributes<HTMLSpanElement> & {
  status: "added" | "modified" | "deleted" | "renamed"
}

export const CommitFileStatus = ({
  status,
  className,
  children,
  ...props
}: CommitFileStatusProps) => (
  <span
    className={cn("font-medium font-mono text-xs", fileStatusStyles[status], className)}
    {...props}
  >
    {children ?? fileStatusLabels[status]}
  </span>
)

export type CommitFileIconProps = ComponentProps<typeof FileIcon>

export const CommitFileIcon = ({ className, ...props }: CommitFileIconProps) => (
  <FileIcon className={cn("size-3.5 shrink-0 text-muted-foreground", className)} {...props} />
)

export type CommitFilePathProps = HTMLAttributes<HTMLSpanElement>

export const CommitFilePath = ({ className, children, ...props }: CommitFilePathProps) => (
  <span className={cn("truncate font-mono text-xs", className)} {...props}>
    {children}
  </span>
)

export type CommitFileChangesProps = HTMLAttributes<HTMLDivElement>

export const CommitFileChanges = ({ className, children, ...props }: CommitFileChangesProps) => (
  <div className={cn("flex shrink-0 items-center gap-1 font-mono text-xs", className)} {...props}>
    {children}
  </div>
)

export type CommitFileAdditionsProps = HTMLAttributes<HTMLSpanElement> & {
  count: number
}

export const CommitFileAdditions = ({
  count,
  className,
  children,
  ...props
}: CommitFileAdditionsProps) => {
  if (count <= 0) return null
  return (
    <span className={cn("text-green-600 dark:text-green-400", className)} {...props}>
      {children ?? (
        <>
          <PlusIcon className="inline-block size-3" />
          {count}
        </>
      )}
    </span>
  )
}

export type CommitFileDeletionsProps = HTMLAttributes<HTMLSpanElement> & {
  count: number
}

export const CommitFileDeletions = ({
  count,
  className,
  children,
  ...props
}: CommitFileDeletionsProps) => {
  if (count <= 0) return null
  return (
    <span className={cn("text-red-600 dark:text-red-400", className)} {...props}>
      {children ?? (
        <>
          <MinusIcon className="inline-block size-3" />
          {count}
        </>
      )}
    </span>
  )
}

/** Demo component for preview */
export default function CommitDemo() {
  return (
    <div className="w-full max-w-lg p-4">
      <Commit defaultOpen>
        <CommitHeader>
          <CommitInfo>
            <CommitMessage>Add user authentication flow</CommitMessage>
            <CommitMetadata>
              <CommitHash>a1b2c3d</CommitHash>
              <CommitSeparator />
              <span>John Doe</span>
              <CommitSeparator />
              <CommitTimestamp date={new Date(Date.now() - 86400000)} />
            </CommitMetadata>
          </CommitInfo>
          <CommitActions>
            <CommitCopyButton hash="a1b2c3d4e5f6" />
          </CommitActions>
        </CommitHeader>
        <CommitContent>
          <CommitFiles>
            <CommitFile>
              <CommitFileInfo>
                <CommitFileStatus status="added" />
                <CommitFileIcon />
                <CommitFilePath>src/auth/login.tsx</CommitFilePath>
              </CommitFileInfo>
              <CommitFileChanges>
                <CommitFileAdditions count={45} />
              </CommitFileChanges>
            </CommitFile>
            <CommitFile>
              <CommitFileInfo>
                <CommitFileStatus status="modified" />
                <CommitFileIcon />
                <CommitFilePath>src/app.tsx</CommitFilePath>
              </CommitFileInfo>
              <CommitFileChanges>
                <CommitFileAdditions count={12} />
                <CommitFileDeletions count={3} />
              </CommitFileChanges>
            </CommitFile>
          </CommitFiles>
        </CommitContent>
      </Commit>
    </div>
  )
}
