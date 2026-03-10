import { useRef, useState } from "react";
import { TOKEN_STORAGE_KEY } from "@superbuilder/features-client/core/auth";
import type { GenerationStreamEvent } from "@superbuilder/features-server/ai-image/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, useTRPC } from "@/lib/trpc";

function getAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    const token = raw ? JSON.parse(raw) : null;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // ignore parse errors
  }
  return {};
}

export function useImageGeneration() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<GenerationStreamEvent | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const connectStream = async (genId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      const response = await fetch(`${API_URL}/api/ai-image/stream/${genId}`, {
        headers: getAuthHeaders(),
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
            const data = JSON.parse(line.slice(6)) as GenerationStreamEvent;
            setStreamStatus(data);
          } catch {
            // ignore JSON parse errors
          }
        }
      }

      queryClient.invalidateQueries({
        queryKey: trpc.aiImage.history.queryKey(),
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setStreamStatus({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Stream error",
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const generateMutation = useMutation({
    ...trpc.aiImage.generate.mutationOptions(),
    onSuccess: (data) => {
      setGenerationId(data.generationId);
      setStreamStatus({ status: "pending", progress: 0 });
      connectStream(data.generationId);
    },
  });

  const generate = (input: {
    prompt: string;
    model?: string;
    format?: "feed" | "carousel" | "story" | "reels_cover";
    styleTemplateId?: string;
    contentThemeId?: string;
    themeVariables?: Record<string, string>;
    inputImageBase64?: string;
  }) => {
    setStreamStatus(null);
    setGenerationId(null);
    generateMutation.mutate(input);
  };

  const abort = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const reset = () => {
    abort();
    setGenerationId(null);
    setStreamStatus(null);
  };

  return {
    generate,
    reset,
    abort,
    generationId,
    streamStatus,
    isGenerating: generateMutation.isPending || isStreaming,
    error: generateMutation.error,
  };
}

export function useStyleTemplates() {
  const trpc = useTRPC();
  return useQuery(trpc.aiImage.styleTemplates.queryOptions());
}

export function useImageHistory(page = 1, limit = 20) {
  const trpc = useTRPC();
  return useQuery(trpc.aiImage.history.queryOptions({ page, limit }));
}

export function useContentThemes() {
  const trpc = useTRPC();
  return useQuery(trpc.aiImage.contentThemes.queryOptions());
}

export function useImageReuse(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.aiImage.reuse.queryOptions({ id }),
    enabled: !!id,
  });
}
