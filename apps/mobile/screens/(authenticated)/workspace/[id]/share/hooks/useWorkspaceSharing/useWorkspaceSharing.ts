import type { ShareGranteeRef } from "@superset/shared/sharing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "@/lib/trpc/client";

export type WorkspaceVisibility = "just_me" | "org";

const sharingKey = (id: string | undefined) => [
	"cloud",
	"cloudWorkspace",
	"sharing",
	id,
];

/** Who a cloud workspace is shared with, and the owner's changes to it. */
export function useWorkspaceSharing(id: string | undefined) {
	const queryClient = useQueryClient();
	const sharing = useQuery({
		queryKey: sharingKey(id),
		enabled: Boolean(id),
		queryFn: () =>
			apiClient.cloudWorkspace.sharing.get.query({ id: id as string }),
	});
	const refresh = useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: sharingKey(id) }),
			queryClient.invalidateQueries({
				queryKey: ["cloud", "cloudWorkspace", "list"],
			}),
		]);
	}, [queryClient, id]);

	const add = useMutation({
		mutationFn: (grantees: ShareGranteeRef[]) =>
			apiClient.cloudWorkspace.sharing.add.mutate({
				id: id as string,
				grantees,
			}),
		onSuccess: refresh,
	});
	const remove = useMutation({
		mutationFn: (grantee: ShareGranteeRef) =>
			apiClient.cloudWorkspace.sharing.remove.mutate({
				id: id as string,
				grantee,
			}),
		onSuccess: refresh,
	});
	const setVisibility = useMutation({
		mutationFn: (visibility: WorkspaceVisibility) =>
			apiClient.cloudWorkspace.setVisibility.mutate({
				id: id as string,
				visibility,
			}),
		onSuccess: refresh,
	});

	return { sharing, add, remove, setVisibility };
}
