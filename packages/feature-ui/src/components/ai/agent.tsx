"use client"

import { BotIcon } from "lucide-react"
import type { ComponentProps, HTMLAttributes } from "react"
import { memo } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../_shadcn/accordion"
import { Badge } from "../../_shadcn/badge"
import { cn } from "../../lib/utils"

export type AgentProps = HTMLAttributes<HTMLDivElement>

export const Agent = memo(({ className, ...props }: AgentProps) => (
  <div className={cn("not-prose w-full rounded-md border", className)} {...props} />
))

export type AgentHeaderProps = HTMLAttributes<HTMLDivElement> & {
  name: string
  model?: string
}

export const AgentHeader = memo(({ className, name, model, ...props }: AgentHeaderProps) => (
  <div className={cn("flex w-full items-center justify-between gap-4 p-3", className)} {...props}>
    <div className="flex items-center gap-2">
      <BotIcon className="size-4 text-muted-foreground" />
      <span className="font-medium text-sm">{name}</span>
      {model && (
        <Badge className="font-mono text-xs" variant="secondary">
          {model}
        </Badge>
      )}
    </div>
  </div>
))

export type AgentContentProps = HTMLAttributes<HTMLDivElement>

export const AgentContent = memo(({ className, ...props }: AgentContentProps) => (
  <div className={cn("space-y-4 p-4 pt-0", className)} {...props} />
))

export type AgentInstructionsProps = HTMLAttributes<HTMLDivElement> & {
  children: string
}

export const AgentInstructions = memo(
  ({ className, children, ...props }: AgentInstructionsProps) => (
    <div className={cn("space-y-2", className)} {...props}>
      <span className="font-medium text-muted-foreground text-sm">Instructions</span>
      <div className="rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
        <p>{children}</p>
      </div>
    </div>
  ),
)

export type AgentToolsProps = ComponentProps<typeof Accordion>

export const AgentTools = memo(({ className, ...props }: AgentToolsProps) => (
  <div className={cn("space-y-2", className)}>
    <span className="font-medium text-muted-foreground text-sm">Tools</span>
    <Accordion className="rounded-md border" type="multiple" {...props} />
  </div>
))

interface ToolSchema {
  description?: string
  jsonSchema?: object
  inputSchema?: object
}

export type AgentToolProps = ComponentProps<typeof AccordionItem> & {
  tool: ToolSchema
}

export const AgentTool = memo(({ className, tool, value, ...props }: AgentToolProps) => {
  const schema = "jsonSchema" in tool && tool.jsonSchema ? tool.jsonSchema : tool.inputSchema

  return (
    <AccordionItem className={cn("border-b last:border-b-0", className)} value={value} {...props}>
      <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
        {tool.description ?? "No description"}
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <div className="rounded-md bg-muted/50">
          <pre className="overflow-auto p-3 font-mono text-xs">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
})

export type AgentOutputProps = HTMLAttributes<HTMLDivElement> & {
  schema: string
}

export const AgentOutput = memo(({ className, schema, ...props }: AgentOutputProps) => (
  <div className={cn("space-y-2", className)} {...props}>
    <span className="font-medium text-muted-foreground text-sm">Output Schema</span>
    <div className="rounded-md bg-muted/50">
      <pre className="overflow-auto p-3 font-mono text-xs">{schema}</pre>
    </div>
  </div>
))

Agent.displayName = "Agent"
AgentHeader.displayName = "AgentHeader"
AgentContent.displayName = "AgentContent"
AgentInstructions.displayName = "AgentInstructions"
AgentTools.displayName = "AgentTools"
AgentTool.displayName = "AgentTool"
AgentOutput.displayName = "AgentOutput"

/** Demo component for preview */
export default function AgentDemo() {
  const sampleTools = [
    {
      description: "Search the web for current information",
      jsonSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          limit: { type: "number", description: "Max results to return" },
        },
        required: ["query"],
      },
    },
    {
      description: "Read a file from the filesystem",
      jsonSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
    },
  ]

  return (
    <div className="w-full max-w-lg p-4">
      <Agent>
        <AgentHeader name="Research Assistant" model="claude-3-opus" />
        <AgentContent>
          <AgentInstructions>
            You are a helpful research assistant. Search the web for information and provide
            accurate, well-sourced answers.
          </AgentInstructions>
          <AgentTools type="multiple">
            {sampleTools.map((tool, index) => (
              <AgentTool key={index} tool={tool} value={`tool-${index}`} />
            ))}
          </AgentTools>
          <AgentOutput
            schema={
              "interface ResearchResult {\n  answer: string;\n  sources: string[];\n  confidence: number;\n}"
            }
          />
        </AgentContent>
      </Agent>
    </div>
  )
}
