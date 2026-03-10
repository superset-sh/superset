"use client"

import { ChevronRightIcon } from "lucide-react"
import { type ComponentProps, createContext, type HTMLAttributes, useContext } from "react"
import { Badge } from "../../_shadcn/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../_shadcn/collapsible"
import { cn } from "../../lib/utils"

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

interface SchemaParameter {
  name: string
  type: string
  required?: boolean
  description?: string
  location?: "path" | "query" | "header"
}

interface SchemaProperty {
  name: string
  type: string
  required?: boolean
  description?: string
  properties?: SchemaProperty[]
  items?: SchemaProperty
}

interface SchemaDisplayContextType {
  method: HttpMethod
  path: string
  description?: string
  parameters?: SchemaParameter[]
  requestBody?: SchemaProperty[]
  responseBody?: SchemaProperty[]
}

const SchemaDisplayContext = createContext<SchemaDisplayContextType>({
  method: "GET",
  path: "",
})

export type SchemaDisplayProps = HTMLAttributes<HTMLDivElement> & {
  method: HttpMethod
  path: string
  description?: string
  parameters?: SchemaParameter[]
  requestBody?: SchemaProperty[]
  responseBody?: SchemaProperty[]
}

export const SchemaDisplay = ({
  method,
  path,
  description,
  parameters,
  requestBody,
  responseBody,
  className,
  children,
  ...props
}: SchemaDisplayProps) => (
  <SchemaDisplayContext.Provider
    value={{ method, path, description, parameters, requestBody, responseBody }}
  >
    <div className={cn("overflow-hidden rounded-lg border bg-background", className)} {...props}>
      {children ?? (
        <>
          <SchemaDisplayHeader>
            <div className="flex items-center gap-3">
              <SchemaDisplayMethod />
              <SchemaDisplayPath />
            </div>
          </SchemaDisplayHeader>
          {description && <SchemaDisplayDescription />}
          <SchemaDisplayContent>
            {parameters && parameters.length > 0 && <SchemaDisplayParameters />}
            {requestBody && requestBody.length > 0 && <SchemaDisplayRequest />}
            {responseBody && responseBody.length > 0 && <SchemaDisplayResponse />}
          </SchemaDisplayContent>
        </>
      )}
    </div>
  </SchemaDisplayContext.Provider>
)

export type SchemaDisplayHeaderProps = HTMLAttributes<HTMLDivElement>

export const SchemaDisplayHeader = ({
  className,
  children,
  ...props
}: SchemaDisplayHeaderProps) => (
  <div className={cn("flex items-center gap-3 border-b px-4 py-3", className)} {...props}>
    {children}
  </div>
)

const methodStyles: Record<HttpMethod, string> = {
  GET: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PUT: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  PATCH: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

export type SchemaDisplayMethodProps = ComponentProps<typeof Badge>

export const SchemaDisplayMethod = ({
  className,
  children,
  ...props
}: SchemaDisplayMethodProps) => {
  const { method } = useContext(SchemaDisplayContext)

  return (
    <Badge
      className={cn("font-mono text-xs", methodStyles[method], className)}
      variant="secondary"
      {...props}
    >
      {children ?? method}
    </Badge>
  )
}

export type SchemaDisplayPathProps = HTMLAttributes<HTMLSpanElement>

export const SchemaDisplayPath = ({ className, children, ...props }: SchemaDisplayPathProps) => {
  const { path } = useContext(SchemaDisplayContext)

  // Highlight path parameters
  const highlightedPath = path.replace(
    /\{([^}]+)\}/g,
    '<span class="text-blue-600 dark:text-blue-400">{$1}</span>',
  )

  return (
    <span
      className={cn("font-mono text-sm", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: needed for parameter highlighting
      dangerouslySetInnerHTML={{ __html: children?.toString() ?? highlightedPath }}
      {...props}
    />
  )
}

export type SchemaDisplayDescriptionProps = HTMLAttributes<HTMLParagraphElement>

export const SchemaDisplayDescription = ({
  className,
  children,
  ...props
}: SchemaDisplayDescriptionProps) => {
  const { description } = useContext(SchemaDisplayContext)

  return (
    <p className={cn("border-b px-4 py-3 text-muted-foreground text-sm", className)} {...props}>
      {children ?? description}
    </p>
  )
}

export type SchemaDisplayContentProps = HTMLAttributes<HTMLDivElement>

export const SchemaDisplayContent = ({
  className,
  children,
  ...props
}: SchemaDisplayContentProps) => (
  <div className={cn("divide-y", className)} {...props}>
    {children}
  </div>
)

export type SchemaDisplayParametersProps = ComponentProps<typeof Collapsible>

export const SchemaDisplayParameters = ({
  className,
  children,
  ...props
}: SchemaDisplayParametersProps) => {
  const { parameters } = useContext(SchemaDisplayContext)

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="font-medium text-sm">Parameters</span>
        <Badge className="ml-auto text-xs" variant="secondary">
          {parameters?.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y border-t">
          {children ??
            parameters?.map(param => <SchemaDisplayParameter key={param.name} {...param} />)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export type SchemaDisplayParameterProps = HTMLAttributes<HTMLDivElement> & SchemaParameter

export const SchemaDisplayParameter = ({
  name,
  type,
  required,
  description,
  location,
  className,
  ...props
}: SchemaDisplayParameterProps) => (
  <div className={cn("px-4 py-3 pl-10", className)} {...props}>
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">{name}</span>
      <Badge className="text-xs" variant="outline">
        {type}
      </Badge>
      {location && (
        <Badge className="text-xs" variant="secondary">
          {location}
        </Badge>
      )}
      {required && (
        <Badge
          className="bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400"
          variant="secondary"
        >
          required
        </Badge>
      )}
    </div>
    {description && <p className="mt-1 text-muted-foreground text-sm">{description}</p>}
  </div>
)

export type SchemaDisplayRequestProps = ComponentProps<typeof Collapsible>

export const SchemaDisplayRequest = ({
  className,
  children,
  ...props
}: SchemaDisplayRequestProps) => {
  const { requestBody } = useContext(SchemaDisplayContext)

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="font-medium text-sm">Request Body</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t">
          {children ??
            requestBody?.map(prop => <SchemaDisplayProperty key={prop.name} {...prop} depth={0} />)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export type SchemaDisplayResponseProps = ComponentProps<typeof Collapsible>

export const SchemaDisplayResponse = ({
  className,
  children,
  ...props
}: SchemaDisplayResponseProps) => {
  const { responseBody } = useContext(SchemaDisplayContext)

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="font-medium text-sm">Response</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t">
          {children ??
            responseBody?.map(prop => (
              <SchemaDisplayProperty key={prop.name} {...prop} depth={0} />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export type SchemaDisplayBodyProps = HTMLAttributes<HTMLDivElement>

export const SchemaDisplayBody = ({ className, children, ...props }: SchemaDisplayBodyProps) => (
  <div className={cn("divide-y", className)} {...props}>
    {children}
  </div>
)

export type SchemaDisplayPropertyProps = HTMLAttributes<HTMLDivElement> &
  SchemaProperty & {
    depth?: number
  }

export const SchemaDisplayProperty = ({
  name,
  type,
  required,
  description,
  properties,
  items,
  depth = 0,
  className,
  ...props
}: SchemaDisplayPropertyProps) => {
  const hasChildren = properties || items
  const paddingLeft = 40 + depth * 16

  if (hasChildren) {
    return (
      <Collapsible defaultOpen={depth < 2}>
        <CollapsibleTrigger
          className={cn(
            "group flex w-full items-center gap-2 py-3 text-left transition-colors hover:bg-muted/50",
            className,
          )}
          style={{ paddingLeft }}
        >
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <span className="font-mono text-sm">{name}</span>
          <Badge className="text-xs" variant="outline">
            {type}
          </Badge>
          {required && (
            <Badge
              className="bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400"
              variant="secondary"
            >
              required
            </Badge>
          )}
        </CollapsibleTrigger>
        {description && (
          <p
            className="pb-2 text-muted-foreground text-sm"
            style={{ paddingLeft: paddingLeft + 24 }}
          >
            {description}
          </p>
        )}
        <CollapsibleContent>
          <div className="divide-y border-t">
            {properties?.map(prop => (
              <SchemaDisplayProperty key={prop.name} {...prop} depth={depth + 1} />
            ))}
            {items && <SchemaDisplayProperty {...items} depth={depth + 1} name={`${name}[]`} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <div className={cn("py-3 pr-4", className)} style={{ paddingLeft }} {...props}>
      <div className="flex items-center gap-2">
        <span className="size-4" /> {/* Spacer for alignment */}
        <span className="font-mono text-sm">{name}</span>
        <Badge className="text-xs" variant="outline">
          {type}
        </Badge>
        {required && (
          <Badge
            className="bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400"
            variant="secondary"
          >
            required
          </Badge>
        )}
      </div>
      {description && <p className="mt-1 pl-6 text-muted-foreground text-sm">{description}</p>}
    </div>
  )
}

export type SchemaDisplayExampleProps = HTMLAttributes<HTMLPreElement>

export const SchemaDisplayExample = ({
  className,
  children,
  ...props
}: SchemaDisplayExampleProps) => (
  <pre
    className={cn("mx-4 mb-4 overflow-auto rounded-md bg-muted p-4 font-mono text-sm", className)}
    {...props}
  >
    {children}
  </pre>
)

/** Demo component for preview */
export function SchemaDisplayDemo() {
  return (
    <div className="w-full max-w-2xl p-4">
      <div className="overflow-hidden rounded-lg border bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Badge className="bg-blue-100 font-mono text-blue-700 text-xs dark:bg-blue-900/30 dark:text-blue-400">
            POST
          </Badge>
          <span className="font-mono text-sm">
            /api/users/<span className="text-blue-600 dark:text-blue-400">{"{userId}"}</span>
            /messages
          </span>
        </div>

        {/* Description */}
        <p className="border-b px-4 py-3 text-muted-foreground text-sm">
          Send a message to a specific user
        </p>

        {/* Parameters */}
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50">
            <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <span className="font-medium text-sm">Parameters</span>
            <Badge className="ml-auto text-xs" variant="secondary">
              2
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y border-t">
              <div className="px-4 py-3 pl-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">userId</span>
                  <Badge variant="outline" className="text-xs">
                    string
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    path
                  </Badge>
                  <Badge className="bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400">
                    required
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">The user's unique ID</p>
              </div>
              <div className="px-4 py-3 pl-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">format</span>
                  <Badge variant="outline" className="text-xs">
                    string
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    query
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">Response format (json or xml)</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Request Body */}
        <Collapsible defaultOpen className="border-t">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50">
            <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <span className="font-medium text-sm">Request Body</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y border-t">
              <div className="px-4 py-3 pl-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">content</span>
                  <Badge variant="outline" className="text-xs">
                    string
                  </Badge>
                  <Badge className="bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400">
                    required
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">The message content</p>
              </div>
              <div className="px-4 py-3 pl-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">priority</span>
                  <Badge variant="outline" className="text-xs">
                    string
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">Message priority level</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Response */}
        <Collapsible defaultOpen className="border-t">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50">
            <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <span className="font-medium text-sm">Response</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y border-t">
              <div className="px-4 py-3 pl-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">id</span>
                  <Badge variant="outline" className="text-xs">
                    string
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">Created message ID</p>
              </div>
              <div className="px-4 py-3 pl-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">status</span>
                  <Badge variant="outline" className="text-xs">
                    string
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">Delivery status</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

export default SchemaDisplayDemo
