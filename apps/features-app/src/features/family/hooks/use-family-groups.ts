/**
 * Family Group Queries
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery } from "@tanstack/react-query";

export function useMyFamilyGroups() {
  const trpc = useTRPC();
  return useQuery(trpc.family.getMyGroups.queryOptions());
}

export function useFamilyGroup(groupId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.family.getGroup.queryOptions({ groupId }),
    enabled: !!groupId,
  });
}
