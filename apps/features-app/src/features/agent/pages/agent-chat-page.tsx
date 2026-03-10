import { useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { useChatStream } from "../hooks/use-chat-stream";
import { useThreadMessages } from "../hooks/use-threads";
import { ChatStream } from "../components/chat/chat-stream";
import { ChatInput } from "../components/chat/chat-input";
import { ThreadSidebar } from "../components/chat/thread-sidebar";
import {
  currentThreadIdAtom,
  messagesAtom,
  sidebarOpenAtom,
} from "../store/chat.atoms";

export function AgentChatPage() {
  const { messages, isStreaming, sendMessage, stopStreaming } = useChatStream();
  const threadId = useAtomValue(currentThreadIdAtom);
  const setMessages = useSetAtom(messagesAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);

  // 스레드 선택 시 메시지 로드
  const { data: threadMessages } = useThreadMessages(threadId ?? undefined);

  useEffect(() => {
    if (threadMessages && threadMessages.length > 0) {
      setMessages(
        threadMessages.map((m: any) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content ?? "",
          createdAt: m.createdAt
            ? String(m.createdAt)
            : new Date().toISOString(),
        })),
      );
    }
  }, [threadMessages, setMessages]);

  const handleSend = (message: string) => {
    sendMessage({
      message,
      threadId: threadId ?? undefined,
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <ThreadSidebar />
      <div className="flex flex-1 flex-col">
        {/* 상단 바 */}
        <div className="flex h-10 items-center border-b px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
        <ChatStream messages={messages} isStreaming={isStreaming} />
        <ChatInput
          onSend={handleSend}
          onStop={stopStreaming}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
