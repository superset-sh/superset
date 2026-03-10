import { useState, useCallback, Children, isValidElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback } from "../../_shadcn/avatar";
import { Bot, Copy, Check } from "lucide-react";

interface Props {
  content: string;
  variant?: "user" | "assistant";
  isStreaming?: boolean;
  showAvatar?: boolean;
  avatarIcon?: React.ReactNode;
  className?: string;
}

export function ChatMessage({
  content,
  variant = "assistant",
  isStreaming,
  showAvatar = true,
  avatarIcon,
  className,
}: Props) {
  const isUser = variant === "user";

  if (isUser) {
    return (
      <div className={cn("flex justify-end pr-2", className)}>
        <div className="max-w-[85%] rounded-[1.25rem] rounded-tr-sm bg-primary/10 text-primary-foreground/90 px-4 py-2.5 shadow-sm ring-1 ring-primary/20">
          <span className="whitespace-pre-wrap text-[15px] leading-relaxed font-medium">
            {content}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-4", className)}>
      {showAvatar && (
        <Avatar className="mt-1 size-8 shrink-0 shadow-sm border border-border/50">
          <AvatarFallback className="bg-primary/5 text-primary">
            {avatarIcon ?? <Bot className="size-4" />}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1 space-y-2 mt-1">
        <div className="text-[15px] leading-relaxed text-foreground/90">
          <MarkdownContent content={content} />
          {isStreaming && content && (
            <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle rounded-full" />
          )}
          {isStreaming && !content && <TypingDotsInline />}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

export function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em>{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        code: ({ className, children }) => {
          if (className) {
            return <code className={className}>{children}</code>;
          }
          return (
            <code className="rounded-md bg-muted px-1.5 py-0.5 text-[13px] font-mono">
              {children}
            </code>
          );
        },
        h1: ({ children }) => (
          <h1 className="mb-3 mt-5 text-lg font-bold first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-3 text-sm font-semibold first:mt-0">
            {children}
          </h3>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-4 border-border/50" />,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-lg border border-border/50">
            <table className="min-w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-t border-border/50 px-3 py-2">{children}</td>
        ),
        del: ({ children }) => (
          <del className="text-muted-foreground line-through">{children}</del>
        ),
        input: ({ checked, ...props }) => (
          <input
            type="checkbox"
            checked={checked}
            disabled
            className="mr-1.5 align-middle"
            {...props}
          />
        ),
      }}
    >
      {content}
    </Markdown>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const { language, textContent } = extractCodeInfo(children);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border/50">
      <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          <span>{copied ? "복사됨" : "복사"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto bg-muted/30 p-4 text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

function TypingDotsInline() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
    </span>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function extractCodeInfo(children: ReactNode): {
  language: string;
  textContent: string;
} {
  let language = "";
  let textContent = "";

  const extract = (node: ReactNode): void => {
    if (typeof node === "string") {
      textContent += node;
      return;
    }
    if (typeof node === "number") {
      textContent += String(node);
      return;
    }
    if (isValidElement(node)) {
      const props = node.props as Record<string, unknown>;
      if (typeof props.className === "string") {
        const match = /language-(\w+)/.exec(props.className);
        if (match?.[1]) language = match[1];
      }
      if (props.children) {
        Children.forEach(props.children as ReactNode, extract);
      }
    }
    if (Array.isArray(node)) {
      node.forEach(extract);
    }
  };

  Children.forEach(children, extract);
  textContent = textContent.replace(/\n$/, "");

  return { language, textContent };
}
