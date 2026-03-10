"use client"

import { CopyIcon, RefreshCcwIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { Button } from "../../_shadcn/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../_shadcn/tooltip"
import { cn } from "../../lib/utils"
import { Message, MessageContent } from "../../packages/ai/message"

export type ActionsProps = ComponentProps<"div">

export const Actions = ({ className, children, ...props }: ActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
)

export type ActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export const Action = ({
  tooltip,
  children,
  label,
  className,
  variant = "ghost",
  size = "sm",
  ...props
}: ActionProps) => {
  const button = (
    <Button
      className={cn("size-9 p-1.5 text-muted-foreground hover:text-foreground", className)}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return button
}

/** Demo component for preview */
export default function ActionsDemo() {
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <Message from="assistant">
        <MessageContent>
          Here's a quick example of how to use React hooks. The useState hook lets you add state to
          functional components, while useEffect handles side effects like data fetching or
          subscriptions.
        </MessageContent>

        <Actions>
          <Action onClick={() => console.log("Copied!")} tooltip="Copy to clipboard">
            <CopyIcon className="size-4" />
          </Action>
          <Action onClick={() => console.log("Regenerating...")} tooltip="Regenerate response">
            <RefreshCcwIcon className="size-4" />
          </Action>
          <Action onClick={() => console.log("Thumbs up!")} tooltip="Good response">
            <ThumbsUpIcon className="size-4" />
          </Action>
          <Action onClick={() => console.log("Thumbs down!")} tooltip="Bad response">
            <ThumbsDownIcon className="size-4" />
          </Action>
        </Actions>
      </Message>
    </div>
  )
}
