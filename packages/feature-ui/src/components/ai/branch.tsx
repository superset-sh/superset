"use client"

import type { UIMessage } from "ai"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { ComponentProps, HTMLAttributes, ReactElement } from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { Button } from "../../_shadcn/button"
import { cn } from "../../lib/utils"

interface BranchContextType {
  currentBranch: number
  totalBranches: number
  goToPrevious: () => void
  goToNext: () => void
  branches: ReactElement[]
  setBranches: (branches: ReactElement[]) => void
}

const BranchContext = createContext<BranchContextType | null>(null)

const useBranch = () => {
  const context = useContext(BranchContext)
  if (!context) {
    throw new Error("Branch components must be used within Branch")
  }
  return context
}

export type BranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number
  onBranchChange?: (branchIndex: number) => void
}

export const Branch = ({ defaultBranch = 0, onBranchChange, className, ...props }: BranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])

  const handleBranchChange = (newBranch: number) => {
    setCurrentBranch(newBranch)
    onBranchChange?.(newBranch)
  }

  const goToPrevious = () => {
    const newBranch = currentBranch > 0 ? currentBranch - 1 : branches.length - 1
    handleBranchChange(newBranch)
  }

  const goToNext = () => {
    const newBranch = currentBranch < branches.length - 1 ? currentBranch + 1 : 0
    handleBranchChange(newBranch)
  }

  const contextValue: BranchContextType = {
    currentBranch,
    totalBranches: branches.length,
    goToPrevious,
    goToNext,
    branches,
    setBranches,
  }

  return (
    <BranchContext.Provider value={contextValue}>
      <div className={cn("grid w-full gap-2 [&>div]:pb-0", className)} {...props} />
    </BranchContext.Provider>
  )
}

export type BranchMessagesProps = HTMLAttributes<HTMLDivElement>

export const BranchMessages = ({ children, ...props }: BranchMessagesProps) => {
  const { currentBranch, setBranches, branches } = useBranch()

  const childrenArray = Array.isArray(children) ? children : [children]

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray as ReactElement[])
    }
  }, [childrenArray, branches, setBranches])

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden",
      )}
      key={(branch as ReactElement).key ?? index}
      {...props}
    >
      {branch}
    </div>
  ))
}

export type BranchSelectorProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"]
}

export const BranchSelector = ({ className, from, ...props }: BranchSelectorProps) => {
  const { totalBranches } = useBranch()

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 self-end px-10",
        from === "assistant" ? "justify-start" : "justify-end",
        className,
      )}
      {...props}
    />
  )
}

export type BranchPreviousProps = ComponentProps<typeof Button>

export const BranchPrevious = ({ className, children, ...props }: BranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useBranch()

  return (
    <Button
      aria-label="Previous branch"
      className={cn(
        "size-7 shrink-0 rounded-full text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  )
}

export type BranchNextProps = ComponentProps<typeof Button>

export const BranchNext = ({ className, children, ...props }: BranchNextProps) => {
  const { goToNext, totalBranches } = useBranch()

  return (
    <Button
      aria-label="Next branch"
      className={cn(
        "size-7 shrink-0 rounded-full text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  )
}

export type BranchPageProps = HTMLAttributes<HTMLSpanElement>

export const BranchPage = ({ className, ...props }: BranchPageProps) => {
  const { currentBranch, totalBranches } = useBranch()

  return (
    <span
      className={cn("font-medium text-muted-foreground text-xs tabular-nums", className)}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </span>
  )
}

import { Message, MessageContent } from "../../packages/ai/message"

/** Demo component for preview */
export default function BranchDemo() {
  return (
    <div className="flex w-full flex-col gap-4">
      <Message from="user">
        <MessageContent>What's the best way to learn React?</MessageContent>
      </Message>

      <Branch onBranchChange={index => console.log("Branch changed to:", index)}>
        <BranchMessages>
          <Message from="assistant" key="v1">
            <MessageContent>
              Start with the official React documentation at react.dev. It has an excellent
              interactive tutorial that teaches you the fundamentals step by step.
            </MessageContent>
          </Message>

          <Message from="assistant" key="v2">
            <MessageContent>
              I recommend a project-based approach: pick a simple app idea and build it while
              learning. Start with Create React App or Vite, then gradually add features.
            </MessageContent>
          </Message>

          <Message from="assistant" key="v3">
            <MessageContent>
              Take a structured course on platforms like Frontend Masters or Scrimba. They offer
              hands-on React courses with exercises.
            </MessageContent>
          </Message>
        </BranchMessages>

        <BranchSelector from="assistant">
          <BranchPrevious />
          <BranchPage />
          <BranchNext />
        </BranchSelector>
      </Branch>
    </div>
  )
}
