import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useAiChat() {
  const trpc = useTRPC();

  const chat = useMutation(
    trpc.contentStudio.ai.chat.mutationOptions()
  );

  return { chat };
}

export function useAiSuggest(_studioId: string) {
  const trpc = useTRPC();

  const suggest = useMutation(
    trpc.contentStudio.ai.suggest.mutationOptions()
  );

  return { suggest };
}

export function useAiGenerate(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const canvasKey = trpc.contentStudio.canvas.queryKey({ studioId });

  const generate = useMutation(
    trpc.contentStudio.ai.generate.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: canvasKey }),
    })
  );

  return { generate };
}

export function useAiSuggestAndGenerate(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const canvasKey = trpc.contentStudio.canvas.queryKey({ studioId });

  const suggestAndGenerate = useMutation(
    trpc.contentStudio.ai.suggestAndGenerate.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: canvasKey }),
    })
  );

  return { suggestAndGenerate };
}
