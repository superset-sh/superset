import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

export function useCreateSectionFromWorkspaces() {
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
				`Failed to create section: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	return { mutate };
}
