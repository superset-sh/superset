import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useSseStream } from "@superbuilder/feature-ui/hooks/use-sse-stream";
import { useTRPC, getAuthHeaders, API_URL } from "../../../lib/trpc";
import { lastTokenUsageAtom } from "../store/agent-settings.atoms";
import type { PipelineStreamEvent } from "../types";

export function useGenerateScreensStream() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setLastTokenUsage = useSetAtom(lastTokenUsageAtom);

  const [streamingText, setStreamingText] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { send: sseSend, abort, isStreaming } = useSseStream<PipelineStreamEvent>({
    url: `${API_URL}/api/agent-desk/pipeline/generate-screens/stream`,
    getHeaders: () => getAuthHeaders(),
  });

  const generateScreens = async (sessionId: string, model?: string) => {
    setStreamingText("");
    setStage(null);
    setStageMessage(null);
    setError(null);

    let sseError: string | null = null;

    await sseSend({
      body: { sessionId, ...(model ? { model } : {}) },
      onEvent: (event) => {
        switch (event.type) {
          case "progress":
            setStage(event.stage ?? null);
            setStageMessage(event.message ?? null);
            break;
          case "text-delta":
            if (event.content) {
              setStreamingText((prev) => prev + event.content);
            }
            break;
          case "usage":
            if (event.usage) {
              setLastTokenUsage(event.usage);
            }
            break;
          case "error":
            sseError = event.message ?? "Unknown error";
            setError(sseError);
            break;
        }
      },
      onComplete: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.agentDesk.getSession.queryKey({ id: sessionId }),
        });
      },
      onError: (err) => {
        sseError = err.message;
        setError(err.message);
      },
    });

    // SSE 에러 이벤트가 있었으면 caller에게 전파
    if (sseError) {
      throw new Error(sseError);
    }
  };

  return {
    generateScreens,
    abort,
    isGeneratingScreens: isStreaming,
    streamingText,
    stage,
    stageMessage,
    error,
  };
}
