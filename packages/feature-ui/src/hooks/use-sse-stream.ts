import { useState, useCallback, useRef } from "react";

interface UseSseStreamOptions {
  url: string;
  getHeaders?: () => Record<string, string>;
}

interface SendOptions<TEvent = unknown> {
  body: unknown;
  onEvent: (event: TEvent) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function useSseStream<TEvent = unknown>(options: UseSseStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (sendOptions: SendOptions<TEvent>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsStreaming(true);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(options.getHeaders?.() ?? {}),
        };

        const response = await fetch(options.url, {
          method: "POST",
          headers,
          body: JSON.stringify(sendOptions.body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("ReadableStream not supported");

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
              const data = JSON.parse(line.slice(6)) as TEvent;
              sendOptions.onEvent(data);
            } catch {
              // JSON 파싱 실패 무시
            }
          }
        }

        sendOptions.onComplete?.();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const error = err instanceof Error ? err : new Error(String(err));
          sendOptions.onError?.(error);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [options.url, options.getHeaders],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { send, abort, isStreaming };
}
