"use client"

import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from "lucide-react"
import { createContext, type HTMLAttributes, type ReactNode, useContext, useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../_shadcn/collapsible"
import { cn } from "../../lib/utils"

interface FileTreeContextType {
  expandedPaths: Set<string>
  togglePath: (path: string) => void
  selectedPath?: string
  onSelect?: (path: string) => void
}

const FileTreeContext = createContext<FileTreeContextType>({
  expandedPaths: new Set(),
  togglePath: () => undefined,
})

export type FileTreeProps = HTMLAttributes<HTMLDivElement> & {
  expanded?: Set<string>
  defaultExpanded?: Set<string>
  selectedPath?: string
  onSelect?: (path: string) => void
  onExpandedChange?: (expanded: Set<string>) => void
}

export const FileTree = ({
  expanded: controlledExpanded,
  defaultExpanded = new Set(),
  selectedPath,
  onSelect,
  onExpandedChange,
  className,
  children,
  ...props
}: FileTreeProps) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const expandedPaths = controlledExpanded ?? internalExpanded

  const togglePath = (path: string) => {
    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setInternalExpanded(newExpanded)
    onExpandedChange?.(newExpanded)
  }

  return (
    <FileTreeContext.Provider value={{ expandedPaths, togglePath, selectedPath, onSelect }}>
      <div
        className={cn("rounded-lg border bg-background font-mono text-sm", className)}
        role="tree"
        {...props}
      >
        <div className="p-2">{children}</div>
      </div>
    </FileTreeContext.Provider>
  )
}

interface FileTreeFolderContextType {
  path: string
  name: string
  isExpanded: boolean
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
  path: "",
  name: "",
  isExpanded: false,
})

export type FileTreeFolderProps = HTMLAttributes<HTMLDivElement> & {
  path: string
  name: string
}

export const FileTreeFolder = ({
  path,
  name,
  className,
  children,
  ...props
}: FileTreeFolderProps) => {
  const { expandedPaths, togglePath, selectedPath, onSelect } = useContext(FileTreeContext)
  const isExpanded = expandedPaths.has(path)
  const isSelected = selectedPath === path

  return (
    <FileTreeFolderContext.Provider value={{ path, name, isExpanded }}>
      <Collapsible onOpenChange={() => togglePath(path)} open={isExpanded}>
        <div className={cn("", className)} role="treeitem" tabIndex={0} {...props}>
          <CollapsibleTrigger render={<button className={cn(
                                  "flex w-full items-center gap-1 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50",
                                  isSelected && "bg-muted",
                                )} onClick={() => onSelect?.(path)} type="button" />}><ChevronRightIcon
                                  className={cn(
                                    "size-4 shrink-0 text-muted-foreground transition-transform",
                                    isExpanded && "rotate-90",
                                  )}
                                /><FileTreeIcon>
                                  {isExpanded ? (
                                    <FolderOpenIcon className="size-4 text-blue-500" />
                                  ) : (
                                    <FolderIcon className="size-4 text-blue-500" />
                                  )}
                                </FileTreeIcon><FileTreeName>{name}</FileTreeName></CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-4 border-l pl-2">{children}</div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </FileTreeFolderContext.Provider>
  )
}

interface FileTreeFileContextType {
  path: string
  name: string
}

const FileTreeFileContext = createContext<FileTreeFileContextType>({
  path: "",
  name: "",
})

export type FileTreeFileProps = HTMLAttributes<HTMLDivElement> & {
  path: string
  name: string
  icon?: ReactNode
}

export const FileTreeFile = ({
  path,
  name,
  icon,
  className,
  children,
  ...props
}: FileTreeFileProps) => {
  const { selectedPath, onSelect } = useContext(FileTreeContext)
  const isSelected = selectedPath === path

  return (
    <FileTreeFileContext.Provider value={{ path, name }}>
      <div
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted/50",
          isSelected && "bg-muted",
          className,
        )}
        onClick={() => onSelect?.(path)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            onSelect?.(path)
          }
        }}
        role="treeitem"
        tabIndex={0}
        {...props}
      >
        {children ?? (
          <>
            <span className="size-4" />
            <FileTreeIcon>
              {icon ?? <FileIcon className="size-4 text-muted-foreground" />}
            </FileTreeIcon>
            <FileTreeName>{name}</FileTreeName>
          </>
        )}
      </div>
    </FileTreeFileContext.Provider>
  )
}

export type FileTreeIconProps = HTMLAttributes<HTMLSpanElement>

export const FileTreeIcon = ({ className, children, ...props }: FileTreeIconProps) => (
  <span className={cn("shrink-0", className)} {...props}>
    {children}
  </span>
)

export type FileTreeNameProps = HTMLAttributes<HTMLSpanElement>

export const FileTreeName = ({ className, children, ...props }: FileTreeNameProps) => (
  <span className={cn("truncate", className)} {...props}>
    {children}
  </span>
)

export type FileTreeActionsProps = HTMLAttributes<HTMLDivElement>

export const FileTreeActions = ({ className, children, ...props }: FileTreeActionsProps) => (
  <div
    className={cn("ml-auto flex items-center gap-1", className)}
    onClick={e => e.stopPropagation()}
    onKeyDown={e => e.stopPropagation()}
    role="group"
    {...props}
  >
    {children}
  </div>
)

/** Demo component for preview */
export default function FileTreeDemo() {
  const [selected, setSelected] = useState<string>()

  return (
    <div className="w-full max-w-xs p-4">
      <FileTree
        defaultExpanded={new Set(["src", "src/components"])}
        selectedPath={selected}
        onSelect={setSelected}
      >
        <FileTreeFolder path="src" name="src">
          <FileTreeFolder path="src/components" name="components">
            <FileTreeFile path="src/components/Button.tsx" name="Button.tsx" />
            <FileTreeFile path="src/components/Card.tsx" name="Card.tsx" />
          </FileTreeFolder>
          <FileTreeFile path="src/index.ts" name="index.ts" />
        </FileTreeFolder>
        <FileTreeFile path="package.json" name="package.json" />
        <FileTreeFile path="README.md" name="README.md" />
      </FileTree>
    </div>
  )
}
