"use client"

import type { ToolUIPart } from "ai"
import { CheckIcon, XIcon } from "lucide-react"
import { type ComponentProps, createContext, type ReactNode, useContext } from "react"
import { Alert, AlertDescription } from "../../_shadcn/alert"
import { Button } from "../../_shadcn/button"
import { cn } from "../../lib/utils"

type ToolUIPartApproval =
  | {
      id: string
      approved?: never
      reason?: never
    }
  | {
      id: string
      approved: boolean
      reason?: string
    }
  | {
      id: string
      approved: true
      reason?: string
    }
  | {
      id: string
      approved: true
      reason?: string
    }
  | {
      id: string
      approved: false
      reason?: string
    }
  | undefined

interface ConfirmationContextValue {
  approval: ToolUIPartApproval
  state: ToolUIPart["state"]
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null)

const useConfirmation = () => {
  const context = useContext(ConfirmationContext)

  if (!context) {
    throw new Error("Confirmation components must be used within Confirmation")
  }

  return context
}

export type ConfirmationProps = ComponentProps<typeof Alert> & {
  approval?: ToolUIPartApproval
  state: ToolUIPart["state"]
}

export const Confirmation = ({ className, approval, state, ...props }: ConfirmationProps) => {
  if (!approval || state === "input-streaming" || state === "input-available") {
    return null
  }

  return (
    <ConfirmationContext.Provider value={{ approval, state }}>
      <Alert className={cn("flex flex-col gap-2", className)} {...props} />
    </ConfirmationContext.Provider>
  )
}

export type ConfirmationTitleProps = ComponentProps<typeof AlertDescription>

export const ConfirmationTitle = ({ className, ...props }: ConfirmationTitleProps) => (
  <AlertDescription className={cn("inline", className)} {...props} />
)

export interface ConfirmationRequestProps {
  children?: ReactNode
}

export const ConfirmationRequest = ({ children }: ConfirmationRequestProps) => {
  const { state } = useConfirmation()

  // Only show when approval is requested
  // @ts-expect-error state only available in AI SDK v6
  if (state !== "approval-requested") {
    return null
  }

  return children
}

export interface ConfirmationAcceptedProps {
  children?: ReactNode
}

export const ConfirmationAccepted = ({ children }: ConfirmationAcceptedProps) => {
  const { approval, state } = useConfirmation()

  // Only show when approved and in response states
  if (
    !approval?.approved ||
    // @ts-expect-error state only available in AI SDK v6
    (state !== "approval-responded" &&
      // @ts-expect-error state only available in AI SDK v6
      state !== "output-denied" &&
      state !== "output-available")
  ) {
    return null
  }

  return children
}

export interface ConfirmationRejectedProps {
  children?: ReactNode
}

export const ConfirmationRejected = ({ children }: ConfirmationRejectedProps) => {
  const { approval, state } = useConfirmation()

  // Only show when rejected and in response states
  if (
    approval?.approved !== false ||
    // @ts-expect-error state only available in AI SDK v6
    (state !== "approval-responded" &&
      // @ts-expect-error state only available in AI SDK v6
      state !== "output-denied" &&
      state !== "output-available")
  ) {
    return null
  }

  return children
}

export type ConfirmationActionsProps = ComponentProps<"div">

export const ConfirmationActions = ({ className, ...props }: ConfirmationActionsProps) => {
  const { state } = useConfirmation()

  // Only show when approval is requested
  // @ts-expect-error state only available in AI SDK v6
  if (state !== "approval-requested") {
    return null
  }

  return (
    <div className={cn("flex items-center justify-end gap-2 self-end", className)} {...props} />
  )
}

export type ConfirmationActionProps = ComponentProps<typeof Button>

export const ConfirmationAction = (props: ConfirmationActionProps) => (
  <Button className="h-8 px-3 text-sm" type="button" {...props} />
)

/** Demo component for preview */
export default function ConfirmationDemo() {
  return (
    <div className="w-full max-w-2xl p-6">
      <Confirmation approval={{ id: "demo-1" }} state="approval-requested">
        <ConfirmationTitle>
          <ConfirmationRequest>
            This tool wants to delete the file{" "}
            <code className="inline rounded bg-muted px-1.5 py-0.5 text-sm">/tmp/example.txt</code>.
            Do you approve this action?
          </ConfirmationRequest>
          <ConfirmationAccepted>
            <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
            <span>You approved this tool execution</span>
          </ConfirmationAccepted>
          <ConfirmationRejected>
            <XIcon className="size-4 text-destructive" />
            <span>You rejected this tool execution</span>
          </ConfirmationRejected>
        </ConfirmationTitle>
        <ConfirmationActions>
          <ConfirmationAction variant="outline">Reject</ConfirmationAction>
          <ConfirmationAction variant="default">Approve</ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </div>
  )
}
