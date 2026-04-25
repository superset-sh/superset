import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { PendingWorkspaceRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { StoreApi } from "zustand/vanilla";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

interface UseConsumePendingLaunchArgs {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

/**
 * Consumes a pending row's `terminalLaunch` / `chatLaunch` stashed by
 * the pending page after host-service.create resolved. Opens the
 * corresponding pane in the V2 `@superset/panes` store, clears the
 * field so subsequent mounts don't re-dispatch.
 *
 * Pattern mirrors useV2PresetExecution: live-query a record, open a
 * pane with the store, call workspaceTrpc for any PTY side effects.
 * See apps/desktop/docs/V2_LAUNCH_CONTEXT.md "Dispatch architecture".
 */
export function useConsumePendingLaunch({
	workspaceId,
	store,
}: UseConsumePendingLaunchArgs): void {
	const collections = useCollections();
	const ensureSession = workspaceTrpc.terminal.ensureSession.useMutation();
	const ensureSessionRef = useRef(ensureSession);
	ensureSessionRef.current = ensureSession;
	const consumedRef = useRef<Set<string>>(new Set());

	const { data: matches } = useLiveQuery(
		(q) =>
			q
				.from({ pw: collections.pendingWorkspaces })
				.where(({ pw }) => eq(pw.workspaceId, workspaceId))
				.select(({ pw }) => ({ ...pw })),
		[collections, workspaceId],
	);

	const pending: PendingWorkspaceRow | null =
		(matches?.[0] as PendingWorkspaceRow | undefined) ?? null;

	const updateRow = useCallback(
		(patch: Partial<PendingWorkspaceRow>) => {
			if (!pending) return;
			collections.pendingWorkspaces.update(pending.id, (draft) => {
				Object.assign(draft, patch);
			});
		},
		[collections, pending],
	);

	useEffect(() => {
		if (!pending) {
			return;
		}

		const terminalKey = pending.terminalLaunch
			? `${pending.id}:terminal`
			: null;
		const chatKey = pending.chatLaunch ? `${pending.id}:chat` : null;

		console.log("[v2-launch] useConsumePendingLaunch: tick", {
			workspaceId,
			pendingId: pending.id,
			status: pending.status,
			hasTerminalLaunch: !!pending.terminalLaunch,
			hasChatLaunch: !!pending.chatLaunch,
			terminalConsumed: terminalKey
				? consumedRef.current.has(terminalKey)
				: null,
			chatConsumed: chatKey ? consumedRef.current.has(chatKey) : null,
		});

		if (terminalKey && !consumedRef.current.has(terminalKey)) {
			consumedRef.current.add(terminalKey);
			console.log("[v2-launch] useConsumePendingLaunch: consuming terminal", {
				command: pending.terminalLaunch?.command.slice(0, 120),
			});
			void consumeTerminalLaunch({
				pending,
				store,
				ensureSession: ensureSessionRef.current.mutateAsync,
				clear: () => updateRow({ terminalLaunch: null }),
			});
		}

		if (chatKey && !consumedRef.current.has(chatKey)) {
			consumedRef.current.add(chatKey);
			console.log("[v2-launch] useConsumePendingLaunch: consuming chat");
			consumeChatLaunch({
				pending,
				store,
				clear: () => updateRow({ chatLaunch: null }),
			});
		}
	}, [pending, store, updateRow, workspaceId]);
}

async function consumeTerminalLaunch({
	pending,
	store,
	ensureSession,
	clear,
}: {
	pending: PendingWorkspaceRow;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	ensureSession: (input: {
		terminalId: string;
		workspaceId: string;
		initialCommand?: string;
	}) => Promise<unknown>;
	clear: () => void;
}): Promise<void> {
	const launch = pending.terminalLaunch;
	if (!launch || !pending.workspaceId) {
		console.warn("[v2-launch] consumeTerminalLaunch: bailing", {
			hasLaunch: !!launch,
			hasWorkspaceId: !!pending.workspaceId,
		});
		// Defensive — shouldn't happen if the caller checked terminalLaunch
		// already. Worth a toast so we see it in practice.
		toast.error("Couldn't open agent pane", {
			description:
				"Missing launch data — please retry from the workspace menu.",
		});
		return;
	}

	const terminalId = crypto.randomUUID();
	console.log("[v2-launch] consumeTerminalLaunch: ensureSession", {
		terminalId,
		workspaceId: pending.workspaceId,
		commandPreview: launch.command.slice(0, 120),
	});

	try {
		await ensureSession({
			terminalId,
			workspaceId: pending.workspaceId,
			initialCommand: launch.command,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(
			"[v2-launch] consumeTerminalLaunch: ensureSession failed:",
			err,
		);
		toast.error("Couldn't start agent terminal", { description: msg });
		return;
	}

	const data: TerminalPaneData = { terminalId };
	console.log("[v2-launch] consumeTerminalLaunch: addTab", { terminalId });
	store.getState().addTab({
		panes: [
			{
				kind: "terminal",
				titleOverride: launch.name,
				data: data as PaneViewerData,
			},
		],
	});
	clear();
	console.log("[v2-launch] consumeTerminalLaunch: done + cleared");
}

function consumeChatLaunch({
	pending,
	store,
	clear,
}: {
	pending: PendingWorkspaceRow;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	clear: () => void;
}): void {
	const launch = pending.chatLaunch;
	if (!launch) return;

	const data: ChatPaneData = {
		sessionId: null,
		launchConfig: {
			initialPrompt: launch.initialPrompt,
			initialFiles: launch.initialFiles,
			model: launch.model,
			taskSlug: launch.taskSlug,
		},
	};

	console.log("[v2-launch] consumeChatLaunch: addTab", {
		hasPrompt: !!launch.initialPrompt,
		fileCount: launch.initialFiles?.length ?? 0,
	});
	store.getState().addTab({
		panes: [
			{
				kind: "chat",
				data: data as PaneViewerData,
			},
		],
	});
	clear();
	console.log("[v2-launch] consumeChatLaunch: done + cleared");
}
