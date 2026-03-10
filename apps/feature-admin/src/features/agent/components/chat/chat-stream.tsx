import { useEffect, useRef } from "react";
import { ChatMessage } from "./chat-message";
import type { ChatMessage as ChatMessageType } from "../../types";

interface Props {
  messages: ChatMessageType[];
  isStreaming: boolean;
}

export function ChatStream({ messages, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 추가되면 스크롤 다운
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl py-6">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            isStreaming={
              isStreaming &&
              index === messages.length - 1 &&
              message.role === "assistant"
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

function EmptyState() {
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
