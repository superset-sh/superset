import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useCanvasData(studioId: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.contentStudio.canvas.queryOptions(
      { studioId },
      { enabled: !!studioId }
    )
  );
}

export function useContent(contentId: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.contentStudio.getContent.queryOptions(
      { id: contentId },
      { enabled: !!contentId }
    )
  );
}

export function useSeoHistory(contentId: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.contentStudio.seoHistory.queryOptions(
      { contentId },
      { enabled: !!contentId }
    )
  );
}
