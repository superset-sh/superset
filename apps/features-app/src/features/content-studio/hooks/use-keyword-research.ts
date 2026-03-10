import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useKeywordResearch() {
  const trpc = useTRPC();
  return useMutation(
    trpc.contentStudio.seo.suggestKeywords.mutationOptions()
  );
}
