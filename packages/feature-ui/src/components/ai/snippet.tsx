"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { Button } from "../../_shadcn/button"
import { Input } from "../../_shadcn/input"
import { cn } from "../../lib/utils"

interface SnippetContextType {
  code: string
}

const SnippetContext = createContext<SnippetContextType>({
  code: "",
})

export type SnippetProps = HTMLAttributes<HTMLDivElement> & {
  code: string
}

export const Snippet = ({ code, className, children, ...props }: SnippetProps) => (
  <SnippetContext.Provider value={{ code }}>
    <div className={cn("flex items-center font-mono", className)} {...props}>
      {children}
    </div>
  </SnippetContext.Provider>
)

export type SnippetAddonProps = HTMLAttributes<HTMLDivElement>

export const SnippetAddon = ({ className, ...props }: SnippetAddonProps) => (
  <div
    className={cn(
      "flex h-9 items-center rounded-l-md border border-r-0 bg-muted px-3 text-muted-foreground text-sm",
      className,
    )}
    {...props}
  />
)

export type SnippetTextProps = HTMLAttributes<HTMLSpanElement>

export const SnippetText = ({ className, ...props }: SnippetTextProps) => (
  <span className={cn("font-normal text-muted-foreground", className)} {...props} />
)

export type SnippetInputProps = Omit<ComponentProps<typeof Input>, "readOnly" | "value">

export const SnippetInput = ({ className, ...props }: SnippetInputProps) => {
  const { code } = useContext(SnippetContext)

  return (
    <Input
      className={cn("rounded-none border-r-0 text-foreground", className)}
      readOnly
      value={code}
      {...props}
    />
  )
}

export type SnippetCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const SnippetCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: SnippetCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<number>(0)
  const { code } = useContext(SnippetContext)

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"))
      return
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(code)
        setIsCopied(true)
        onCopy?.()
        timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout)
      }
    } catch (error) {
      onError?.(error as Error)
    }
  }

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  const Icon = isCopied ? CheckIcon : CopyIcon

  return (
    <Button
      aria-label="Copy"
      className={cn("rounded-l-none", className)}
      onClick={copyToClipboard}
      size="icon"
      title="Copy"
      variant="outline"
      {...props}
    >
      {children ?? <Icon className="size-3.5" />}
    </Button>
  )
}

/** Demo component for preview */
export default function SnippetDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-4 p-4">
      <Snippet code="npm install @shadcn/ui">
        <SnippetAddon>
          <SnippetText>$</SnippetText>
        </SnippetAddon>
        <SnippetInput />
        <SnippetCopyButton />
      </Snippet>

      <Snippet code="sk-proj-abc123xyz789">
        <SnippetAddon>
          <SnippetText>API_KEY</SnippetText>
        </SnippetAddon>
        <SnippetInput />
        <SnippetCopyButton />
      </Snippet>
    </div>
  )
}
