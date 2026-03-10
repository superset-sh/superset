import { useCallback } from "react";
import { useAtom, useSetAtom } from "jotai";
import { useSseStream } from "@superbuilder/feature-ui/hooks/use-sse-stream";
import { getAuthHeaders } from "@/lib/trpc";
import {
  messagesAtom,
  currentThreadIdAtom,
} from "../store/chat.atoms";

const AGENT_URL =
  import.meta.env.VITE_AGENT_SERVER_URL ?? "http://localhost:3003";

interface StreamEvent {
  text?: string;
  threadId?: string;
}

export function useChatStream() {
  const [messages, setMessages] = useAtom(messagesAtom);
  const setCurrentThreadId = useSetAtom(currentThreadIdAtom);

  const { send: sseSend, abort, isStreaming } = useSseStream<StreamEvent>({
    url: `${AGENT_URL}/api/chat/stream`,
    getHeaders: () => getAuthHeaders() as Record<string, string>,
  });

  const sendMessage = useCallback(
    async (params: {
      message: string;
      agentId?: string;
      threadId?: string;
    }) => {
      // 사용자 메시지를 즉시 UI에 추가
      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: params.message,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // assistant 메시지 placeholder
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant" as const,
          content: "",
          createdAt: new Date().toISOString(),
        },
      ]);

      await sseSend({
        body: params,
        onEvent: (data) => {
          if (data.threadId) {
            setCurrentThreadId(data.threadId);
          }
          if (data.text) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + data.text }
                  : m,
              ),
            );
          }
        },
      });
    },
    [sseSend, setMessages, setCurrentThreadId],
  );

  const stopStreaming = useCallback(() => {
    abort();
  }, [abort]);

  return { messages, isStreaming, sendMessage, stopStreaming };
}
