import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useInternalLinks(studioId: string, excludeContentId: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.contentStudio.seo.studioContents.queryOptions(
      { studioId, excludeContentId },
      { enabled: !!studioId && !!excludeContentId }
    )
  );
}
