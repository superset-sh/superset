import type { ExternalApp } from "@superset/local-db";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface UsePathActionsProps {
	absolutePath: string | null;
	relativePath?: string;
	/** For files: pass cwd to use openFileInEditor. For folders: omit to use openInApp */
	cwd?: string;
	/** Pre-resolved app to avoid per-row default-app queries */
	defaultApp?: ExternalApp | null;
	/** Project ID for per-project default app resolution */
	projectId?: string;
}

export function usePathActions({
	absolutePath,
	relativePath,
	cwd,
	defaultApp,
	projectId,
}: UsePathActionsProps) {
	const openInFinderMutation = electronTrpc.external.openInFinder.useMutation();
	const openInAppMutation = electronTrpc.external.openInApp.useMutation({
		onError: (error) =>
			toast.error("Failed to open in app", {
				description: error.message,
			}),
	});
	const openFileInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation({
			onError: (error) =>
				toast.error("Failed to open in editor", {
					description: error.message,
				}),
		});

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
		const resolvedDefaultApp = defaultApp ?? "cursor";

		if (cwd) {
			openFileInEditorMutation.mutate({ path: absolutePath, cwd, projectId });
		} else {
			openInAppMutation.mutate({
				path: absolutePath,
				app: resolvedDefaultApp,
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
