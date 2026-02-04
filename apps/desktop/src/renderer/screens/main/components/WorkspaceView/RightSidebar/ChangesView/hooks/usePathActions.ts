import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface UsePathActionsProps {
	absolutePath: string | null;
	relativePath?: string;
	/** For files: pass cwd to use openFileInEditor. For folders: omit to use openInApp */
	cwd?: string;
}

export function usePathActions({
	absolutePath,
	relativePath,
	cwd,
}: UsePathActionsProps) {
	const openInFinderMutation = electronTrpc.external.openInFinder.useMutation();
	const openInAppMutation = electronTrpc.external.openInApp.useMutation();
	const openFileInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation();
	const { data: lastUsedApp = "cursor" } =
		electronTrpc.settings.getLastUsedApp.useQuery();

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
			openFileInEditorMutation.mutate({ path: absolutePath, cwd });
		} else {
			openInAppMutation.mutate({ path: absolutePath, app: lastUsedApp });
		}
	}, [
		absolutePath,
		cwd,
		lastUsedApp,
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
