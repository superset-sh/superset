import { useWorkspaceClient } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";

/** Worst-case legitimate create ≈ daemon bootstrap (5s connect + 15s open) +
 * shell env probe (8s); anything past this is a wedged transport, not work. */
const CREATE_SESSION_TIMEOUT_MS = 30_000;

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
	 * host-service. Use it when the pane may never mount (background preset
	 * tabs, migration) — a mounted pane should use `mint()` instead.
	 */
	create(options?: CreateOptions): Promise<string>;
	/**
	 * Mints a terminalId with no network call, for optimistic pane insertion.
	 * Pair with `createOnAttach: true` in the pane data: the pane's WS attach
	 * creates the session host-side, so plain terminal creation can't queue
	 * behind Chromium's 6-per-origin HTTP socket pool under load.
	 */
	mint(): string;
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
			// Bounded: this rides the shared 6-per-origin HTTP pool, which can be
			// starved for minutes under load — without a signal the click hangs
			// silently forever (the server exempts mutations from its timeout).
			await trpcClient.terminal.createSession.mutate(
				{
					terminalId,
					workspaceId,
					themeType,
					initialCommand: options?.command,
					cwd: options?.cwd,
				},
				{ signal: AbortSignal.timeout(CREATE_SESSION_TIMEOUT_MS) },
			);
			return terminalId;
		},
		[trpcClient, workspaceId, themeType],
	);

	const mint = useCallback((): string => crypto.randomUUID(), []);

	// Memoize so the launcher reference is stable across renders — every
	// consumer lists `launcher` in a deps array (preset hook, hotkeys, pane
	// actions, context menu, openers), and a fresh object literal each render
	// would needlessly invalidate all those memos.
	return useMemo<TerminalLauncher>(() => ({ create, mint }), [create, mint]);
}
