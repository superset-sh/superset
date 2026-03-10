import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { ChatMessage } from "./chat-message";

interface Message {
  id: string;
  role: string;
  content: string;
}

interface Props {
  messages: Message[];
  isStreaming: boolean;
  userRoles?: string[];
  emptyState?: React.ReactNode;
  className?: string;
}

export function ChatStream({
  messages,
  isStreaming,
  userRoles = ["user"],
  emptyState,
  className,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return emptyState ?? <DefaultEmptyState />;
  }

  return (
    <div className={cn("flex-1 overflow-y-auto", className)}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 py-6 px-4">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            content={message.content}
            variant={userRoles.includes(message.role) ? "user" : "assistant"}
            isStreaming={
              isStreaming &&
              index === messages.length - 1 &&
              !userRoles.includes(message.role)
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function DefaultEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <p className="text-2xl font-semibold text-foreground">
          무엇을 도와드릴까요?
        </p>
        <p className="mt-2 text-muted-foreground">
          질문을 입력하면 AI가 답변해 드립니다.
        </p>
      </div>
    </div>
  );
}
