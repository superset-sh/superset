"use client"

import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useState,
} from "react"
import { Badge } from "../../_shadcn/badge"
import { Button } from "../../_shadcn/button"
import { Switch } from "../../_shadcn/switch"
import { cn } from "../../lib/utils"

interface EnvironmentVariablesContextType {
  showValues: boolean
  setShowValues: (show: boolean) => void
}

const EnvironmentVariablesContext = createContext<EnvironmentVariablesContextType>({
  showValues: false,
  setShowValues: () => undefined,
})

export type EnvironmentVariablesProps = HTMLAttributes<HTMLDivElement> & {
  showValues?: boolean
  defaultShowValues?: boolean
  onShowValuesChange?: (show: boolean) => void
}

export const EnvironmentVariables = ({
  showValues: controlledShowValues,
  defaultShowValues = false,
  onShowValuesChange,
  className,
  children,
  ...props
}: EnvironmentVariablesProps) => {
  const [internalShowValues, setInternalShowValues] = useState(defaultShowValues)
  const showValues = controlledShowValues ?? internalShowValues

  const setShowValues = (show: boolean) => {
    setInternalShowValues(show)
    onShowValuesChange?.(show)
  }

  return (
    <EnvironmentVariablesContext.Provider value={{ showValues, setShowValues }}>
      <div className={cn("rounded-lg border bg-background", className)} {...props}>
        {children}
      </div>
    </EnvironmentVariablesContext.Provider>
  )
}

export type EnvironmentVariablesHeaderProps = HTMLAttributes<HTMLDivElement>

export const EnvironmentVariablesHeader = ({
  className,
  children,
  ...props
}: EnvironmentVariablesHeaderProps) => (
  <div className={cn("flex items-center justify-between border-b px-4 py-3", className)} {...props}>
    {children}
  </div>
)

export type EnvironmentVariablesTitleProps = HTMLAttributes<HTMLHeadingElement>

export const EnvironmentVariablesTitle = ({
  className,
  children,
  ...props
}: EnvironmentVariablesTitleProps) => (
  <h3 className={cn("font-medium text-sm", className)} {...props}>
    {children ?? "Environment Variables"}
  </h3>
)

export type EnvironmentVariablesToggleProps = ComponentProps<typeof Switch>

export const EnvironmentVariablesToggle = ({
  className,
  ...props
}: EnvironmentVariablesToggleProps) => {
  const { showValues, setShowValues } = useContext(EnvironmentVariablesContext)

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-muted-foreground text-xs">
        {showValues ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
      </span>
      <Switch
        aria-label="Toggle value visibility"
        checked={showValues}
        onCheckedChange={setShowValues}
        {...props}
      />
    </div>
  )
}

export type EnvironmentVariablesContentProps = HTMLAttributes<HTMLDivElement>

export const EnvironmentVariablesContent = ({
  className,
  children,
  ...props
}: EnvironmentVariablesContentProps) => (
  <div className={cn("divide-y", className)} {...props}>
    {children}
  </div>
)

interface EnvironmentVariableContextType {
  name: string
  value: string
}

const EnvironmentVariableContext = createContext<EnvironmentVariableContextType>({
  name: "",
  value: "",
})

export type EnvironmentVariableProps = HTMLAttributes<HTMLDivElement> & {
  name: string
  value: string
}

export const EnvironmentVariable = ({
  name,
  value,
  className,
  children,
  ...props
}: EnvironmentVariableProps) => (
  <EnvironmentVariableContext.Provider value={{ name, value }}>
    <div className={cn("flex items-center justify-between gap-4 px-4 py-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex shrink-0 items-center gap-2">
            <EnvironmentVariableName />
          </div>
          <EnvironmentVariableValue />
        </>
      )}
    </div>
  </EnvironmentVariableContext.Provider>
)

export type EnvironmentVariableGroupProps = HTMLAttributes<HTMLDivElement>

export const EnvironmentVariableGroup = ({
  className,
  children,
  ...props
}: EnvironmentVariableGroupProps) => (
  <div className={cn("flex min-w-0 items-center gap-2", className)} {...props}>
    {children}
  </div>
)

export type EnvironmentVariableNameProps = HTMLAttributes<HTMLSpanElement>

export const EnvironmentVariableName = ({
  className,
  children,
  ...props
}: EnvironmentVariableNameProps) => {
  const { name } = useContext(EnvironmentVariableContext)

  return (
    <span className={cn("font-mono text-sm", className)} {...props}>
      {children ?? name}
    </span>
  )
}

export type EnvironmentVariableValueProps = HTMLAttributes<HTMLSpanElement>

export const EnvironmentVariableValue = ({
  className,
  children,
  ...props
}: EnvironmentVariableValueProps) => {
  const { value } = useContext(EnvironmentVariableContext)
  const { showValues } = useContext(EnvironmentVariablesContext)

  const displayValue = showValues ? value : "•".repeat(Math.min(value.length, 20))

  return (
    <span
      className={cn(
        "truncate font-mono text-muted-foreground text-sm",
        !showValues && "select-none",
        className,
      )}
      title={showValues ? value : undefined}
      {...props}
    >
      {children ?? displayValue}
    </span>
  )
}

export type EnvironmentVariableCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
  copyFormat?: "name" | "value" | "export"
}

export const EnvironmentVariableCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  copyFormat = "value",
  children,
  className,
  ...props
}: EnvironmentVariableCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false)
  const { name, value } = useContext(EnvironmentVariableContext)

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"))
      return
    }

    let textToCopy = value
    if (copyFormat === "name") {
      textToCopy = name
    } else if (copyFormat === "export") {
      textToCopy = `export ${name}="${value}"`
    }

    try {
      await navigator.clipboard.writeText(textToCopy)
      setIsCopied(true)
      onCopy?.()
      setTimeout(() => setIsCopied(false), timeout)
    } catch (error) {
      onError?.(error as Error)
    }
  }

  const Icon = isCopied ? CheckIcon : CopyIcon

  return (
    <Button
      className={cn("size-6 shrink-0", className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={12} />}
    </Button>
  )
}

export type EnvironmentVariableRequiredProps = ComponentProps<typeof Badge>

export const EnvironmentVariableRequired = ({
  className,
  children,
  ...props
}: EnvironmentVariableRequiredProps) => (
  <Badge className={cn("text-xs", className)} variant="secondary" {...props}>
    {children ?? "Required"}
  </Badge>
)

/** Demo component for preview */
export default function EnvironmentVariablesDemo() {
  return (
    <div className="w-full max-w-lg p-4">
      <EnvironmentVariables>
        <EnvironmentVariablesHeader>
          <EnvironmentVariablesTitle />
          <EnvironmentVariablesToggle />
        </EnvironmentVariablesHeader>
        <EnvironmentVariablesContent>
          <EnvironmentVariable name="OPENAI_API_KEY" value="sk-proj-abc123xyz789">
            <EnvironmentVariableGroup className="shrink-0">
              <EnvironmentVariableName />
              <EnvironmentVariableRequired />
            </EnvironmentVariableGroup>
            <EnvironmentVariableGroup>
              <EnvironmentVariableValue />
              <EnvironmentVariableCopyButton />
            </EnvironmentVariableGroup>
          </EnvironmentVariable>
          <EnvironmentVariable
            name="DATABASE_URL"
            value="postgres://user:pass@db.host.io:5432/mydb"
          >
            <EnvironmentVariableGroup className="shrink-0">
              <EnvironmentVariableName />
              <EnvironmentVariableRequired />
            </EnvironmentVariableGroup>
            <EnvironmentVariableGroup>
              <EnvironmentVariableValue />
              <EnvironmentVariableCopyButton copyFormat="export" />
            </EnvironmentVariableGroup>
          </EnvironmentVariable>
          <EnvironmentVariable name="DEBUG" value="true">
            <EnvironmentVariableGroup className="shrink-0">
              <EnvironmentVariableName />
            </EnvironmentVariableGroup>
            <EnvironmentVariableGroup>
              <EnvironmentVariableValue />
              <EnvironmentVariableCopyButton />
            </EnvironmentVariableGroup>
          </EnvironmentVariable>
        </EnvironmentVariablesContent>
      </EnvironmentVariables>
    </div>
  )
}
