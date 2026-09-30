import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { moveCloudWorkspaceRow } from "renderer/routes/_authenticated/_dashboard/utils/moveCloudWorkspaceRow";

export function useArchiveCloudWorkspace() {
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const { mutate } = cloudTrpc.cloudWorkspace.delete.useMutation({
		onMutate: async ({ id }) =>
			organizationId
				? {
						rollback: await moveCloudWorkspaceRow({
							utils,
							organizationId,
							id,
							to: "archived",
						}),
					}
				: undefined,
		onError: (error, _variables, context) => {
			context?.rollback();
			toast.error(errorMessage(error));
		},
		onSettled: (_data, _error, { id }) => {
			void utils.cloudWorkspace.list.invalidate();
			void utils.cloudWorkspace.get.invalidate({ id });
			void utils.cloudWorkspace.activity.invalidate({ id });
		},
	});
	return mutate;
}
