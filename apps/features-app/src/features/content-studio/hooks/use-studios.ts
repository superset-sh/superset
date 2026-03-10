import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useStudios() {
  const trpc = useTRPC();
  return useQuery(trpc.contentStudio.studios.queryOptions());
}
