import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

export function useMoveWorkspaceToSection() {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.moveWorkspaceToSection.useMutation({
		onSuccess: () => invalidateWorkspaceQueries(utils),
		onError: (error) =>
			toast.error(
				t({
					message: `Failed to move workspace: ${error.message}`,
				}),
			),
	});
}
