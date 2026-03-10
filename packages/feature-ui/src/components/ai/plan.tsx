"use client"

import { ChevronsUpDownIcon, FileTextIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { createContext, useContext } from "react"
import { Button } from "../../_shadcn/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../_shadcn/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../_shadcn/collapsible"
import { cn } from "../../lib/utils"
import { Shimmer } from "../../packages/ai/shimmer"

interface PlanContextValue {
  isStreaming: boolean
}

const PlanContext = createContext<PlanContextValue | null>(null)

const usePlan = () => {
  const context = useContext(PlanContext)
  if (!context) {
    throw new Error("Plan components must be used within Plan")
  }
  return context
}

export type PlanProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean
}

export const Plan = ({ className, isStreaming = false, children, ...props }: PlanProps) => (
  <PlanContext.Provider value={{ isStreaming }}>
    <Collapsible data-slot="plan" {...props} render={<Card className={cn("shadow-none", className)} />}>{children}</Collapsible>
  </PlanContext.Provider>
)

export type PlanHeaderProps = ComponentProps<typeof CardHeader>

export const PlanHeader = ({ className, ...props }: PlanHeaderProps) => (
  <CardHeader
    className={cn("flex items-start justify-between", className)}
    data-slot="plan-header"
    {...props}
  />
)

export type PlanTitleProps = Omit<ComponentProps<typeof CardTitle>, "children"> & {
  children: string
}

export const PlanTitle = ({ children, ...props }: PlanTitleProps) => {
  const { isStreaming } = usePlan()

  return (
    <CardTitle data-slot="plan-title" {...props}>
      {isStreaming ? <Shimmer>{children}</Shimmer> : children}
    </CardTitle>
  )
}

export type PlanDescriptionProps = Omit<ComponentProps<typeof CardDescription>, "children"> & {
  children: string
}

export const PlanDescription = ({ className, children, ...props }: PlanDescriptionProps) => {
  const { isStreaming } = usePlan()

  return (
    <CardDescription
      className={cn("text-balance", className)}
      data-slot="plan-description"
      {...props}
    >
      {isStreaming ? <Shimmer>{children}</Shimmer> : children}
    </CardDescription>
  )
}

export type PlanActionProps = ComponentProps<typeof CardAction>

export const PlanAction = (props: PlanActionProps) => (
  <CardAction data-slot="plan-action" {...props} />
)

export type PlanContentProps = ComponentProps<typeof CardContent>

export const PlanContent = (props: PlanContentProps) => (
  <CollapsibleContent render={<CardContent data-slot="plan-content" {...props} />}></CollapsibleContent>
)

export type PlanFooterProps = ComponentProps<"div">

export const PlanFooter = (props: PlanFooterProps) => (
  <CardFooter data-slot="plan-footer" {...props} />
)

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>

export const PlanTrigger = ({ className, ...props }: PlanTriggerProps) => (
  <CollapsibleTrigger {...props} render={<Button className={cn("size-8", className)} data-slot="plan-trigger" size="icon" variant="ghost" />}><ChevronsUpDownIcon className="size-4" /><span className="sr-only">Toggle plan</span></CollapsibleTrigger>
)

/** Demo component for preview */
export default function PlanDemo() {
  return (
    <div className="w-full max-w-2xl p-6">
      <Plan defaultOpen={true}>
        <PlanHeader>
          <div>
            <div className="mb-4 flex items-center gap-2">
              <FileTextIcon className="size-4" />
              <PlanTitle>Rewrite AI Elements to SolidJS</PlanTitle>
            </div>
            <PlanDescription>
              Rewrite the AI Elements component library from React to SolidJS while maintaining
              compatibility with existing React-based shadcn/ui components.
            </PlanDescription>
          </div>
          <PlanTrigger />
        </PlanHeader>
        <PlanContent>
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="mb-2 font-semibold">Key Steps</h3>
              <ul className="list-inside list-disc space-y-1">
                <li>Set up SolidJS project structure</li>
                <li>Install solid-js/compat for React compatibility</li>
                <li>Migrate components one by one</li>
                <li>Update test suite for each component</li>
              </ul>
            </div>
          </div>
        </PlanContent>
        <PlanFooter className="justify-end">
          <PlanAction>
            <Button size="sm">Build</Button>
          </PlanAction>
        </PlanFooter>
      </Plan>
    </div>
  )
}
