import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useSseStream } from "@superbuilder/feature-ui/hooks/use-sse-stream";
import { useTRPC, getAuthHeaders, API_URL } from "../../../lib/trpc";
import { lastTokenUsageAtom } from "../store/agent-settings.atoms";
import type { PipelineStreamEvent } from "../types";

export function useGenerateSpecStream() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setLastTokenUsage = useSetAtom(lastTokenUsageAtom);

  const [streamingText, setStreamingText] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { send: sseSend, abort, isStreaming } = useSseStream<PipelineStreamEvent>({
    url: `${API_URL}/api/agent-desk/pipeline/generate-spec/stream`,
    getHeaders: () => getAuthHeaders(),
  });

  const generateSpec = async (sessionId: string, model?: string) => {
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
          queryKey: trpc.agentDesk.getSession.queryKey({ id: sessionId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.agentDesk.listSessions.queryKey(),
        });
      },
      onError: (err) => {
        sseError = err.message;
        setError(err.message);
      },
    });

    if (sseError) {
      throw new Error(sseError);
    }
  };

  return {
    generateSpec,
    abort,
    isGeneratingSpec: isStreaming,
    streamingText,
    stage,
    stageMessage,
    error,
  };
}
