import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

export function useCreateSectionFromWorkspaces() {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const createSection = electronTrpc.workspaces.createSection.useMutation();
	const moveWorkspaces =
		electronTrpc.workspaces.moveWorkspacesToSection.useMutation();

	const mutate = async ({
		projectId,
		workspaceIds,
		name = "New Section",
	}: {
		projectId: string;
		workspaceIds: string[];
		name?: string;
	}) => {
		try {
			const section = await createSection.mutateAsync({
				projectId,
				name,
			});
			await moveWorkspaces.mutateAsync({
				workspaceIds,
				sectionId: section.id,
			});
			await invalidateWorkspaceQueries(utils);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to create section: ${errorMessage(
						error,
						t({
							message: "Unknown error",
						}),
					)}`,
				}),
			);
		}
	};

	return { mutate };
}
