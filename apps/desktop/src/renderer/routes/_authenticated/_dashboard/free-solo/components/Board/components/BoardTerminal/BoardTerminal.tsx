import type { RendererContext } from "@superset/panes";
import { createWorkspaceStore } from "@superset/panes";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { TerminalPane } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane";
import { useRevealInFinder } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRevealInFinder";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { WorkspaceProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	type BoardCard as BoardCardModel,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";

interface BoardTerminalProps {
	card: BoardCardModel;
}

/** Outer half: resolves the workspace and mounts its provider. The inner half
 *  runs below it because `useOpenInExternalEditor` issues a `workspaceTrpc`
 *  query, which needs the workspace client in scope. */
export function BoardTerminal({ card }: BoardTerminalProps) {
	const { workspaces } = useHostWorkspaces();
	const workspace = workspaces.find((item) => item.id === card.workspaceId);
	if (!workspace) return null;
	return (
		<WorkspaceProvider workspace={workspace}>
			<BoardTerminalInner card={card} />
		</WorkspaceProvider>
	);
}

function BoardTerminalInner({ card }: BoardTerminalProps) {
	const isActive = useFreeSoloBoardStore(
		(state) => state.activeCardId === card.id,
	);
	// Both hooks already refuse remote paths with a toast — reuse them rather
	// than reaching for electronTrpc directly.
	const openInExternalEditor = useOpenInExternalEditor(card.workspaceId);
	const revealInFinder = useRevealInFinder(card.workspaceId);

	const updateCardTerminal = useFreeSoloBoardStore(
		(state) => state.updateCardTerminal,
	);

	// One tab, one pane, both keyed by the card id. The card id IS the
	// registry instanceId — that's what gives this card its own xterm runtime
	// and WebSocket onto a shared session. Re-creating this store on a
	// terminalId change would fight the auto-resume write it exists to receive.
	// biome-ignore lint/correctness/useExhaustiveDependencies: card identity only
	const store = useMemo(() => {
		const created = createWorkspaceStore<PaneViewerData>();
		created.getState().addTab({
			id: card.id,
			panes: [
				{
					id: card.id,
					kind: "terminal",
					data: {
						terminalId: card.terminalId,
						createOnAttach: card.createOnAttach,
					},
				},
			],
		});
		return created;
	}, [card.id]);

	// Agent auto-resume swaps the pane's terminalId in this store. Mirror it
	// back so the card (and its persisted row) follows the live session.
	useEffect(
		() =>
			store.subscribe((state) => {
				const nextTerminalId = (
					state.tabs[0]?.panes[card.id]?.data as
						| { terminalId?: string }
						| undefined
				)?.terminalId;
				if (nextTerminalId) updateCardTerminal(card.id, nextTerminalId);
			}),
		[store, card.id, updateCardTerminal],
	);

	const pane = useSyncExternalStore(
		store.subscribe,
		() => store.getState().tabs[0]?.panes[card.id],
	);

	// TerminalPane rebuilds xterm's link providers whenever these identities
	// change (see its setLinkHandlers effect), so a fresh arrow function every
	// render would tear down and reattach them on every keystroke.
	const handleOpenFile = useCallback(
		(path: string) => openInExternalEditor(path),
		[openInExternalEditor],
	);
	const handleOpenUrl = useCallback((url: string) => {
		electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
			console.error("[free-solo] failed to open URL", url, error);
		});
	}, []);

	if (!pane) return null;

	// Deliberately partial: RendererContext also declares `actions` (close,
	// focus, setTitle, pin, updateData, split) and `components`
	// (PaneHeaderActions), none of which a board card has anywhere to put —
	// the card frame owns close, and there is nothing to split into. TerminalPane
	// reads neither today; if it starts to, this cast is what will hide it, so
	// stub the field it reaches for rather than widening the cast.
	const ctx = {
		pane: { ...pane, parentDirection: null },
		tab: { ...store.getState().tabs[0], position: 0 },
		isActive,
		store,
	} as unknown as RendererContext<PaneViewerData>;

	return (
		<TerminalPane
			ctx={ctx}
			workspaceId={card.workspaceId}
			// The board has no editor pane and no file tree, so both intents
			// leave the app.
			onOpenFile={handleOpenFile}
			// Signature matches revealInFinder's own — no wrapper needed.
			onRevealPath={revealInFinder}
			onOpenUrl={handleOpenUrl}
		/>
	);
}
