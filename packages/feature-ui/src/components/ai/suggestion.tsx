"use client"

import type { ComponentProps } from "react"
import { Button } from "../../_shadcn/button"
import { ScrollArea, ScrollBar } from "../../_shadcn/scroll-area"
import { cn } from "../../lib/utils"

export type SuggestionsProps = ComponentProps<typeof ScrollArea>

export const Suggestions = ({ className, children, ...props }: SuggestionsProps) => (
  <ScrollArea className="w-full overflow-x-auto whitespace-nowrap" {...props}>
    <div className={cn("flex w-max flex-nowrap items-center gap-2", className)}>{children}</div>
    <ScrollBar className="hidden" orientation="horizontal" />
  </ScrollArea>
)

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string
  onClick?: (suggestion: string) => void
}

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = () => {
    onClick?.(suggestion)
  }

  return (
    <Button
      className={cn("cursor-pointer rounded-full px-4", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  )
}

/** Demo component for preview */
export default function SuggestionDemo() {
  const suggestions = [
    "What are the latest trends in AI?",
    "How does machine learning work?",
    "Explain quantum computing",
    "Best practices for React development",
  ]

  return (
    <div className="p-6">
      <Suggestions>
        {suggestions.map(suggestion => (
          <Suggestion
            key={suggestion}
            onClick={s => console.log("Selected:", s)}
            suggestion={suggestion}
          />
        ))}
      </Suggestions>
    </div>
  )
}
