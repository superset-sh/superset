import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { moveCloudWorkspaceRow } from "renderer/routes/_authenticated/_dashboard/utils/moveCloudWorkspaceRow";
import { restartProvisioningTimer } from "renderer/routes/_authenticated/_dashboard/utils/provisioningSince";

export function useUnarchiveCloudWorkspace() {
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const { mutate } = cloudTrpc.cloudWorkspace.unarchive.useMutation({
		onMutate: async ({ id }) =>
			organizationId
				? {
						rollback: await moveCloudWorkspaceRow({
							utils,
							organizationId,
							id,
							to: "active",
						}),
					}
				: undefined,
		onError: (error, _variables, context) => {
			context?.rollback();
			toast.error(errorMessage(error));
		},
		onSettled: (_data, _error, { id }) =>
			Promise.all([
				utils.cloudWorkspace.list.invalidate(),
				utils.cloudWorkspace.get.invalidate({ id }),
				utils.cloudWorkspace.activity.invalidate({ id }),
			]),
	});
	return (id: string, options?: { onSuccess?: () => void }) => {
		restartProvisioningTimer(id);
		mutate(
			{ id },
			{
				onSuccess: ({ unarchived }) => {
					if (unarchived) options?.onSuccess?.();
				},
			},
		);
		void navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: id },
		});
	};
}
