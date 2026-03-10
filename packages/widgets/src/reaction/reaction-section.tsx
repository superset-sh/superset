import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTRPC } from "@superbuilder/features-client/trpc-client";
import { authenticatedAtom } from "@superbuilder/features-client/core/auth";
import { ReactionBar } from "./components/reaction-bar";
import type {
  ReactionType,
  ReactionCounts,
  UserReactionStatus,
} from "@superbuilder/features-server/reaction/types";

interface ReactionSectionProps {
  targetType: string;
  targetId: string;
  className?: string;
}

export function ReactionSection({ targetType, targetId, className }: ReactionSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isAuthenticated = useAtomValue(authenticatedAtom);

  const countsQuery = useQuery(
    trpc.reaction.getCounts.queryOptions({ targetType, targetId }),
  );

  const userStatusQuery = useQuery({
    ...trpc.reaction.getUserStatus.queryOptions({ targetType, targetId }),
    enabled: !!isAuthenticated,
  });

  const toggleMutation = useMutation({
    ...trpc.reaction.toggle.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.reaction.getCounts.queryKey({ targetType, targetId }) });
      queryClient.invalidateQueries({ queryKey: trpc.reaction.getUserStatus.queryKey({ targetType, targetId }) });
    },
  });

  const counts = countsQuery.data as ReactionCounts | undefined;
  const userStatus = userStatusQuery.data as UserReactionStatus | undefined;

  const handleToggle = (type: ReactionType) => {
    if (!isAuthenticated) return;
    (toggleMutation.mutate as unknown as (input: { targetType: string; targetId: string; type: ReactionType }) => void)(
      { targetType, targetId, type },
    );
  };

  return (
    <ReactionBar
      counts={counts?.byType ?? []}
      userTypes={userStatus?.types ?? []}
      onToggle={handleToggle}
      loading={toggleMutation.isPending}
      disabled={!isAuthenticated}
      className={className}
    />
  );
}
