import { useCallback } from "react";
import { useSession } from "@/lib/auth/client";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";

export function useCloudFilters() {
	const { data: session } = useSession();
	const status = useWorkspacesFilterStore((store) => store.cloudStatus);
	const creator = useWorkspacesFilterStore((store) => store.cloudCreator);
	const creatorId =
		creator === "me"
			? (session?.user?.id ?? null)
			: creator === "anyone"
				? null
				: creator.userId;
	const matchesCreator = useCallback(
		(createdByUserId: string | null | undefined) =>
			creator === "anyone" || createdByUserId === creatorId,
		[creator, creatorId],
	);
	return { status, creator, matchesCreator };
}
