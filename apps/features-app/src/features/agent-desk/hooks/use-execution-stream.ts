import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSseStream } from "@superbuilder/feature-ui/hooks/use-sse-stream";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { useTRPC, getAuthHeaders, API_URL } from "../../../lib/trpc";
import type { ExecutionEvent } from "../types";

export function useExecutionStream() {
  const { t } = useFeatureTranslation("agent-desk");
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [latestLog, setLatestLog] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<{ prUrl?: string; prNumber?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const { send: sseSend, abort, isStreaming } = useSseStream<ExecutionEvent & { type: string }>({
    url: `${API_URL}/api/agent-desk/pipeline/execute`,
    getHeaders: () => getAuthHeaders(),
  });

  const execute = useCallback(
    async (sessionId: string) => {
      setEvents([]);
      setLatestLog("");
      setIsExecuting(true);
      setResult(null);
      setError(null);

      await sseSend({
        body: { sessionId },
        onEvent: (event) => {
          setEvents((prev) => [...prev, event]);

          if (event.type === "log" && event.content) {
            setLatestLog(event.content);
          } else if (event.type === "result") {
            setResult({ prUrl: event.prUrl, prNumber: event.prNumber });
          } else if (event.type === "error") {
            setError(event.message ?? t("executionError"));
          } else if (event.type === "status") {
            queryClient.invalidateQueries({
              queryKey: trpc.agentDesk.getSession.queryKey({ id: sessionId }),
            });
          }
        },
        onComplete: () => {
          setIsExecuting(false);
          queryClient.invalidateQueries({
            queryKey: trpc.agentDesk.getSession.queryKey({ id: sessionId }),
          });
        },
      });

      setIsExecuting(false);
    },
    [sseSend, queryClient, trpc, t],
  );

  return { execute, abort, isExecuting: isExecuting || isStreaming, events, latestLog, result, error };
}
