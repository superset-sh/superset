import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useSetCloudWorkspaceVisibility() {
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	return cloudTrpc.cloudWorkspace.setVisibility.useMutation({
		onMutate: async ({ id, visibility }) => {
			if (!organizationId) return;
			const input = { organizationId };
			await utils.cloudWorkspace.list.cancel(input);
			const previous = utils.cloudWorkspace.list.getData(input);
			utils.cloudWorkspace.list.setData(input, (rows) =>
				rows?.map((row) => (row.id === id ? { ...row, visibility } : row)),
			);
			return { previous };
		},
		onError: (_error, _variables, context) => {
			if (organizationId && context?.previous) {
				utils.cloudWorkspace.list.setData({ organizationId }, context.previous);
			}
		},
		onSettled: (_data, _error, { id }) => {
			void utils.cloudWorkspace.list.invalidate();
			void utils.cloudWorkspace.get.invalidate({ id });
			void utils.cloudWorkspace.activity.invalidate({ id });
		},
	});
}
