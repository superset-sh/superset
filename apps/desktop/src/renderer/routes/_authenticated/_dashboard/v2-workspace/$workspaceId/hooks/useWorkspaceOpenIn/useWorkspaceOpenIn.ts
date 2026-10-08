import { useLingui } from "@lingui/react/macro";
import type { ExternalApp } from "@superset/local-db";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo } from "react";
import { getAppOption } from "renderer/components/OpenInExternalDropdown";
import { useHotkey, useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useV2ProjectDefaultApp } from "renderer/routes/_authenticated/hooks/useV2ProjectDefaultApp";
import { useThemeStore } from "renderer/stores";

interface UseWorkspaceOpenInOptions {
	worktreePath: string | null;
	projectId: string | null;
}

export type WorkspaceOpenIn = ReturnType<typeof useWorkspaceOpenIn>;

export function useWorkspaceOpenIn({
	worktreePath,
	projectId,
}: UseWorkspaceOpenInOptions) {
	const { t } = useLingui();
	const activeTheme = useThemeStore((state) => state.activeTheme);

	const { app: persistedApp, setApp: persistDefaultApp } =
		useV2ProjectDefaultApp(projectId ?? undefined);
	const resolvedApp: ExternalApp = persistedApp ?? "finder";

	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: (_data, variables) => {
			persistDefaultApp(variables.app);
		},
		onError: (error) =>
			toast.error(
				t({
					message: `Failed to open: ${error.message}`,
				}),
			),
	});
	const copyPath = electronTrpc.external.copyPath.useMutation({
		onSuccess: () =>
			toast.success(
				t({
					message: "Path copied to clipboard",
				}),
			),
		onError: (error) =>
			toast.error(
				t({
					message: `Failed to copy path: ${error.message}`,
				}),
			),
	});

	const currentApp = useMemo(
		() => getAppOption(resolvedApp) ?? null,
		[resolvedApp],
	);
	const openInDisplay = useHotkeyDisplay("OPEN_IN_APP");
	const copyPathDisplay = useHotkeyDisplay("COPY_PATH");
	const isLoading = openInApp.isPending || copyPath.isPending;

	const openInDefaultApp = useCallback(() => {
		if (!worktreePath || openInApp.isPending || copyPath.isPending) return;
		openInApp.mutate({ path: worktreePath, app: resolvedApp });
	}, [worktreePath, resolvedApp, openInApp, copyPath.isPending]);

	const openInOtherApp = useCallback(
		(appId: ExternalApp) => {
			if (!worktreePath || openInApp.isPending || copyPath.isPending) return;
			openInApp.mutate({ path: worktreePath, app: appId });
		},
		[worktreePath, openInApp, copyPath.isPending],
	);

	const copyWorktreePath = useCallback(() => {
		if (!worktreePath || openInApp.isPending || copyPath.isPending) return;
		copyPath.mutate(worktreePath);
	}, [worktreePath, copyPath, openInApp.isPending]);

	useHotkey("OPEN_IN_APP", openInDefaultApp, {
		enabled: worktreePath !== null,
	});

	return {
		resolvedApp,
		currentApp,
		isDark: activeTheme?.type === "dark",
		isLoading,
		openInShortcut:
			openInDisplay.text !== "Unassigned" ? openInDisplay.text : null,
		copyPathShortcut:
			copyPathDisplay.text !== "Unassigned" ? copyPathDisplay.text : null,
		openInDefaultApp,
		openInOtherApp,
		copyWorktreePath,
	};
}
