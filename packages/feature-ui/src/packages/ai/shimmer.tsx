"use client"

import type { ComponentProps, ElementType } from "react"
import { cn } from "~/lib/utils"

export type ShimmerProps<T extends ElementType = "span"> = ComponentProps<T> & {
  as?: T
  duration?: number
  spread?: number
}

export function Shimmer({
  children,
  as,
  className,
  duration = 2,
  spread = 2,
  style,
  ...props
}: ShimmerProps) {
  const Component = as || "span"

  return (
    <Component
      className={cn(
        "inline-block animate-[shimmer_var(--shimmer-duration)_ease-in-out_infinite] bg-[length:200%_100%] bg-clip-text text-transparent",
        "bg-gradient-to-r from-foreground via-foreground/50 to-foreground",
        className,
      )}
      style={
        {
          "--shimmer-duration": `${duration}s`,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Component>
  )
}
