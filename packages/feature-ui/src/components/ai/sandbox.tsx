"use client"

import { CheckCircleIcon, ChevronDownIcon, CircleIcon, Code, XCircleIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { Badge } from "../../_shadcn/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../_shadcn/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../_shadcn/tabs"
import { cn } from "../../lib/utils"

type SandboxState = "running" | "completed" | "error"

const getStatusBadge = (status: SandboxState) => {
  const labels: Record<SandboxState, string> = {
    running: "Running",
    completed: "Completed",
    error: "Error",
  }

  const icons: Record<SandboxState, ReactNode> = {
    running: <CircleIcon className="size-3 animate-pulse text-blue-600" />,
    completed: <CheckCircleIcon className="size-3 text-green-600" />,
    error: <XCircleIcon className="size-3 text-red-600" />,
  }

  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icons[status]}
      {labels[status]}
    </Badge>
  )
}

export type SandboxProps = ComponentProps<typeof Collapsible>

export const Sandbox = ({ className, ...props }: SandboxProps) => (
  <Collapsible
    className={cn("not-prose group mb-4 w-full overflow-hidden rounded-md border", className)}
    defaultOpen
    {...props}
  />
)

export interface SandboxHeaderProps {
  title?: string
  state: SandboxState
  className?: string
}

export const SandboxHeader = ({ className, title, state, ...props }: SandboxHeaderProps) => (
  <CollapsibleTrigger
    className={cn("flex w-full items-center justify-between gap-4 p-3", className)}
    {...props}
  >
    <div className="flex items-center gap-2">
      <Code className="size-4 text-muted-foreground" />
      <span className="font-medium text-sm">{title}</span>
      {getStatusBadge(state)}
    </div>
    <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
)

export type SandboxContentProps = ComponentProps<typeof CollapsibleContent>

export const SandboxContent = ({ className, ...props }: SandboxContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
)

export type SandboxTabsProps = ComponentProps<typeof Tabs>

export const SandboxTabs = ({ className, ...props }: SandboxTabsProps) => (
  <Tabs className={cn("w-full gap-0", className)} {...props} />
)

export type SandboxTabsBarProps = ComponentProps<"div">

export const SandboxTabsBar = ({ className, ...props }: SandboxTabsBarProps) => (
  <div
    className={cn("flex w-full items-center border-border border-t border-b", className)}
    {...props}
  />
)

export type SandboxTabsListProps = ComponentProps<typeof TabsList>

export const SandboxTabsList = ({ className, ...props }: SandboxTabsListProps) => (
  <TabsList
    className={cn("h-auto rounded-none border-0 bg-transparent p-0", className)}
    {...props}
  />
)

export type SandboxTabsTriggerProps = ComponentProps<typeof TabsTrigger>

export const SandboxTabsTrigger = ({ className, ...props }: SandboxTabsTriggerProps) => (
  <TabsTrigger
    className={cn(
      "rounded-none border-0 border-transparent border-b-2 px-4 py-2 font-medium text-muted-foreground text-sm transition-colors data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
      className,
    )}
    {...props}
  />
)

export type SandboxTabContentProps = ComponentProps<typeof TabsContent>

export const SandboxTabContent = ({ className, ...props }: SandboxTabContentProps) => (
  <TabsContent className={cn("mt-0 text-sm", className)} {...props} />
)

/** Demo component for preview */
export default function SandboxDemo() {
  const sampleCode = `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));`

  const sampleOutput = `> fibonacci(10)
55`

  return (
    <div className="w-full max-w-lg p-4">
      <Sandbox>
        <SandboxHeader title="Code Execution" state="completed" />
        <SandboxContent>
          <SandboxTabs defaultValue="code">
            <SandboxTabsBar>
              <SandboxTabsList>
                <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
                <SandboxTabsTrigger value="console">Console</SandboxTabsTrigger>
              </SandboxTabsList>
            </SandboxTabsBar>
            <SandboxTabContent value="code">
              <pre className="overflow-auto bg-muted/30 p-4 font-mono text-xs">{sampleCode}</pre>
            </SandboxTabContent>
            <SandboxTabContent value="console">
              <pre className="overflow-auto bg-muted/30 p-4 font-mono text-xs text-green-600">
                {sampleOutput}
              </pre>
            </SandboxTabContent>
          </SandboxTabs>
        </SandboxContent>
      </Sandbox>
    </div>
  )
}
