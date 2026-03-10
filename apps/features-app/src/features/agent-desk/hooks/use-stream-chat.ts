import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSseStream } from "@superbuilder/feature-ui/hooks/use-sse-stream";
import { useTRPC, getAuthHeaders, API_URL } from "../../../lib/trpc";
import { toast } from "sonner";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";

interface StreamEvent {
  type: "chunk" | "done" | "error";
  content?: string;
}

export function useStreamChat() {
  const { t } = useFeatureTranslation("agent-desk");
  const [streamingContent, setStreamingContent] = useState("");
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const { send: sseSend, abort: sseAbort, isStreaming } = useSseStream<StreamEvent>({
    url: `${API_URL}/api/agent-desk/chat/stream`,
    getHeaders: () => getAuthHeaders(),
  });

  const abort = useCallback(() => {
    sseAbort();
    setStreamingContent("");
  }, [sseAbort]);

  const send = useCallback(
    async (sessionId: string, content: string, model?: string) => {
      setStreamingContent("");

      await sseSend({
        body: { sessionId, content, ...(model ? { model } : {}) },
        onEvent: (event) => {
          if (event.type === "chunk" && event.content) {
            setStreamingContent((prev) => prev + event.content);
          } else if (event.type === "error") {
            toast.error(event.content ?? t("streamingError"));
          }
        },
        onComplete: () => {
          queryClient.invalidateQueries({
            queryKey: trpc.agentDesk.getSession.queryKey({ id: sessionId }),
          });
        },
      });

      setStreamingContent("");
    },
    [sseSend, queryClient, trpc],
  );

  return { send, abort, isStreaming, streamingContent };
}
