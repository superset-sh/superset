import { useCallback, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { getAuthHeaders } from "@/lib/trpc";
import {
  messagesAtom,
  isStreamingAtom,
  currentThreadIdAtom,
} from "../store/chat.atoms";

const AGENT_URL =
  import.meta.env.VITE_AGENT_SERVER_URL ?? "http://localhost:3003";

export function useChatStream() {
  const [messages, setMessages] = useAtom(messagesAtom);
  const [isStreaming, setIsStreaming] = useAtom(isStreamingAtom);
  const setCurrentThreadId = useSetAtom(currentThreadIdAtom);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (params: {
      message: string;
      agentId?: string;
      threadId?: string;
    }) => {
      setIsStreaming(true);

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

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const authHeaders = getAuthHeaders() as Record<string, string>;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...authHeaders,
        };
        const response = await fetch(`${AGENT_URL}/api/chat/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error("No response body");

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(line.slice(6));

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
            } catch {
              // JSON 파싱 실패 무시
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Chat stream error:", err);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [setMessages, setIsStreaming, setCurrentThreadId],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, isStreaming, sendMessage, stopStreaming };
}
