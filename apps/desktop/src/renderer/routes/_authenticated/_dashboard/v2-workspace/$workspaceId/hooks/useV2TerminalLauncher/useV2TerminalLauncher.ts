import { useWorkspaceClient } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";

interface CreateOptions {
	/**
	 * If provided, the launcher uses this id instead of minting one. Use it
	 * when you already have a terminalId (e.g. rehydrating from a persisted
	 * pane layout). host-service createSession is idempotent: existing
	 * in-memory session → no-op; daemon PTY survived a host-service restart →
	 * adopt; nothing exists → spawn fresh.
	 */
	terminalId?: string;
	command?: string;
	cwd?: string;
}

export interface TerminalLauncher {
	/**
	 * Awaits `terminal.createSession` and returns the terminalId. Callers
	 * should await this before writing the pane into the store, so the pane's
	 * WebSocket connect doesn't race ahead of the session existing on
	 * host-service.
	 */
	create(options?: CreateOptions): Promise<string>;
}

export function useV2TerminalLauncher(): TerminalLauncher {
	const { workspace } = useWorkspace();
	const { trpcClient } = useWorkspaceClient();
	const activeTheme = useTheme();
	const themeType = resolveTerminalThemeType({
		activeThemeType: activeTheme?.type,
	});
	const workspaceId = workspace.id;

	const create = useCallback(
		async (options?: CreateOptions): Promise<string> => {
			const terminalId = options?.terminalId ?? crypto.randomUUID();
			await trpcClient.terminal.createSession.mutate({
				terminalId,
				workspaceId,
				themeType,
				initialCommand: options?.command,
				cwd: options?.cwd,
			});
			return terminalId;
		},
		[trpcClient, workspaceId, themeType],
	);

	// Memoize so the launcher reference is stable across renders — every
	// consumer lists `launcher` in a deps array (preset hook, hotkeys, pane
	// actions, context menu, openers), and a fresh object literal each render
	// would needlessly invalidate all those memos.
	return useMemo<TerminalLauncher>(() => ({ create }), [create]);
}
