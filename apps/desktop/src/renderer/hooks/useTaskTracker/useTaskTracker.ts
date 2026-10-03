import type { TaskTracker } from "@superset/db/enums";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useTaskTracker(): TaskTracker {
	const activeOrganizationId = useActiveOrganizationId();
	const { data: organizations } =
		cloudTrpc.organization.list.useQuery(undefined);
	return (
		organizations?.find((o) => o.id === activeOrganizationId)?.taskTracker ??
		"superset"
	);
}
