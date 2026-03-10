import { useState, useCallback, useRef } from "react";
import { API_URL, getAuthHeaders } from "@/lib/trpc";

interface StreamState {
  text: string;
  isStreaming: boolean;
  error: string | null;
}

const INITIAL_STATE: StreamState = { text: "", isStreaming: false, error: null };

export function useAiChatStream() {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(
    async (input: { studioId: string; contentId: string; prompt: string }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ text: "", isStreaming: true, error: null });

      try {
        const response = await fetch(
          `${API_URL}/api/content-studio/ai/chat/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify(input),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error("스트리밍 요청 실패");
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
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
              if (data.text) {
                setState((prev) => ({
                  ...prev,
                  text: prev.text + data.text,
                }));
              }
              if (data.error) {
                setState((prev) => ({
                  ...prev,
                  error: data.error,
                  isStreaming: false,
                }));
                return;
              }
              if (data.done) {
                setState((prev) => ({ ...prev, isStreaming: false }));
                return;
              }
            } catch {
              // JSON 파싱 실패 시 무시
            }
          }
        }

        setState((prev) => ({ ...prev, isStreaming: false }));
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          error: "AI 요청에 실패했습니다",
          isStreaming: false,
        }));
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  return { ...state, stream, cancel };
}
