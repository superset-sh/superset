import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Bot, User } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "../../types";

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        isUser && "flex-row-reverse",
      )}
    >
      <Avatar className="size-8 shrink-0">
        <AvatarFallback
          className={cn(
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 text-base",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 text-foreground",
        )}
      >
        <div className="whitespace-pre-wrap break-words">
          {message.content}
          {isStreaming && !message.content && (
            <span className="inline-block size-2 animate-pulse rounded-full bg-muted-foreground/50" />
          )}
        </div>
      </div>
    </div>
  );
}
