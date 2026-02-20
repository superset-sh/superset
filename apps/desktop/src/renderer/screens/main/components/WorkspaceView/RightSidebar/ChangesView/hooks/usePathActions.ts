import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface UsePathActionsProps {
	absolutePath: string | null;
	relativePath?: string;
	/** For files: pass cwd to use openFileInEditor. For folders: omit to use openInApp */
	cwd?: string;
	/** Project ID for per-project default app resolution */
	projectId?: string;
}

export function usePathActions({
	absolutePath,
	relativePath,
	cwd,
	projectId,
}: UsePathActionsProps) {
	const openInFinderMutation = electronTrpc.external.openInFinder.useMutation();
	const openInAppMutation = electronTrpc.external.openInApp.useMutation();
	const openFileInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation();
	const { data: defaultApp = "cursor" } =
		electronTrpc.projects.getDefaultApp.useQuery(
			{ projectId: projectId as string },
			{ enabled: !!projectId },
		);

	const copyPath = useCallback(async () => {
		if (absolutePath) {
			await navigator.clipboard.writeText(absolutePath);
		}
	}, [absolutePath]);

	const copyRelativePath = useCallback(async () => {
		if (relativePath) {
			await navigator.clipboard.writeText(relativePath);
		}
	}, [relativePath]);

	const revealInFinder = useCallback(() => {
		if (absolutePath) {
			openInFinderMutation.mutate(absolutePath);
		}
	}, [absolutePath, openInFinderMutation]);

	const openInEditor = useCallback(() => {
		if (!absolutePath) return;

		if (cwd) {
			openFileInEditorMutation.mutate({ path: absolutePath, cwd, projectId });
		} else {
			openInAppMutation.mutate({
				path: absolutePath,
				app: defaultApp,
				projectId,
			});
		}
	}, [
		absolutePath,
		cwd,
		projectId,
		defaultApp,
		openInAppMutation,
		openFileInEditorMutation,
	]);

	return {
		copyPath,
		copyRelativePath,
		revealInFinder,
		openInEditor,
		hasRelativePath: Boolean(relativePath),
	};
}
