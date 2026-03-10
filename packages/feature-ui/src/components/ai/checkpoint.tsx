"use client"

import { BookmarkIcon, type LucideProps } from "lucide-react"
import type { ComponentProps, HTMLAttributes } from "react"
import { Button } from "../../_shadcn/button"
import { Separator } from "../../_shadcn/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../_shadcn/tooltip"
import { cn } from "../../lib/utils"

export type CheckpointProps = HTMLAttributes<HTMLDivElement>

export const Checkpoint = ({ className, children, ...props }: CheckpointProps) => (
  <div
    className={cn("flex items-center gap-0.5 text-muted-foreground overflow-hidden", className)}
    {...props}
  >
    {children}
    <Separator />
  </div>
)

export type CheckpointIconProps = LucideProps

export const CheckpointIcon = ({ className, children, ...props }: CheckpointIconProps) =>
  children ?? <BookmarkIcon className={cn("size-4 shrink-0", className)} {...props} />

export type CheckpointTriggerProps = ComponentProps<typeof Button> & {
  tooltip?: string
}

export const CheckpointTrigger = ({
  children,
  className,
  variant = "ghost",
  size = "sm",
  tooltip,
  ...props
}: CheckpointTriggerProps) =>
  tooltip ? (
    <Tooltip>
      <TooltipTrigger render={<Button size={size} type="button" variant={variant} {...props} />}>{children}</TooltipTrigger>
      <TooltipContent align="start" side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
    </Button>
  )

/** Demo component for preview */
export default function CheckpointDemo() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="text-sm text-muted-foreground">Message 1: What is React?</div>
      <div className="text-sm text-muted-foreground">
        Message 2: React is a JavaScript library...
      </div>
      <Checkpoint>
        <CheckpointIcon />
        <CheckpointTrigger
          onClick={() => console.log("Restore checkpoint")}
          tooltip="Restores workspace and chat to this point"
        >
          Restore checkpoint
        </CheckpointTrigger>
      </Checkpoint>
      <div className="text-sm text-muted-foreground">Message 3: How does state work?</div>
    </div>
  )
}
