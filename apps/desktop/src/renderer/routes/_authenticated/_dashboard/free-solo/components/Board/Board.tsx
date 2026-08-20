import { Button } from "@superset/ui/button";
import { useCallback, useMemo, useState } from "react";
import { HiPlus } from "react-icons/hi2";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	MAX_CARDS,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";
import { useBoardReconciliation } from "../../hooks/useBoardReconciliation";
import { BoardCard } from "../BoardCard";
import { AddCardDialog } from "./components/AddCardDialog";
import { BoardCardTitle } from "./components/BoardCardTitle";
import { BoardTerminal } from "./components/BoardTerminal";
import { DeadCardTile } from "./components/DeadCardTile";
import {
	type HostAgentBinding,
	type HostSession,
	HostTerminalsProbe,
} from "./components/HostTerminalsProbe";

const FULL_REASON = `The board is full (max ${MAX_CARDS} cards) — remove a card to add another.`;

export function Board() {
	const cards = useFreeSoloBoardStore((state) => state.cards);
	const setActiveCard = useFreeSoloBoardStore((state) => state.setActiveCard);
	const [isAdding, setIsAdding] = useState(false);
	const isFull = cards.length >= MAX_CARDS;

	const { workspaces, cache } = useHostWorkspaces();

	// Keyed by hostUrl. Absent = still loading, null = that host's probe
	// settled into an error, an array = its live session list. Owned here
	// (not the picker) so the picker's "which hosts can't be listed" banner
	// and reconciliation's "which cards are dead" verdict read one fan-out
	// instead of running it twice.
	const [sessionsByHost, setSessionsByHost] = useState<
		Record<string, HostSession[] | null>
	>({});
	const handleResult = useCallback(
		(hostUrl: string, sessions: HostSession[] | null) => {
			setSessionsByHost((previous) => ({ ...previous, [hostUrl]: sessions }));
		},
		[],
	);

	// Same shape and rules as sessionsByHost above, for each host's live
	// terminal-agent bindings — only the picker's "Running agents" group
	// reads this; reconciliation and card titles read their own sources.
	const [bindingsByHost, setBindingsByHost] = useState<
		Record<string, HostAgentBinding[] | null>
	>({});
	const handleAgentBindingsResult = useCallback(
		(hostUrl: string, bindings: HostAgentBinding[] | null) => {
			setBindingsByHost((previous) => ({ ...previous, [hostUrl]: bindings }));
		},
		[],
	);

	// One probe per host, not per workspace — terminal.list without a
	// workspaceId already returns every live session on that host. Mounted
	// for as long as the board is open, not just while the picker dialog is,
	// so reconciliation always has live data rather than whatever was last
	// gathered the last time someone opened "Add a terminal".
	const hostUrls = useMemo(() => {
		const urls = new Set<string>();
		for (const workspace of workspaces) {
			const url = cache.resolveHostUrl(workspace.hostId);
			if (url) urls.add(url);
		}
		return [...urls];
	}, [workspaces, cache]);

	// A host key appears here only once that host has actually answered
	// (undefined = pending, null = errored — neither is a verdict). That
	// distinction, not "empty array vs non-empty", is the whole rule that
	// keeps an offline host's cards alive.
	const liveSessionsByHost = useMemo(() => {
		const result: Record<string, ReadonlySet<string>> = {};
		for (const hostUrl of hostUrls) {
			const sessions = sessionsByHost[hostUrl];
			if (!sessions) continue;
			result[hostUrl] = new Set(sessions.map((session) => session.terminalId));
		}
		return result;
	}, [hostUrls, sessionsByHost]);

	useBoardReconciliation(liveSessionsByHost);

	// Read through the *current* hostUrls only, never Object.values — a stale
	// key left behind by a host whose URL changed (host-service restarts move
	// ports) would otherwise contribute titles for sessions that moved with it.
	// Same rule AddCardDialog follows for its own list.
	const titleByTerminalId = useMemo(() => {
		const titles = new Map<string, string>();
		for (const hostUrl of hostUrls) {
			for (const session of sessionsByHost[hostUrl] ?? []) {
				if (session.title) titles.set(session.terminalId, session.title);
			}
		}
		return titles;
	}, [hostUrls, sessionsByHost]);

	// The deselect layer below sits inside the scroller, so `inset-0` alone
	// would only cover the first screenful and clicking empty space would stop
	// deselecting the moment the board is scrolled. Cards are the only thing
	// that extends the scrollable area, so their far edges are its size.
	const contentExtent = useMemo(
		() => ({
			width: cards.reduce((max, card) => Math.max(max, card.x + card.w), 0),
			height: cards.reduce((max, card) => Math.max(max, card.y + card.h), 0),
		}),
		[cards],
	);

	return (
		<div className="relative min-h-0 flex-1 bg-background">
			{hostUrls.map((hostUrl) => (
				<HostTerminalsProbe
					key={hostUrl}
					hostUrl={hostUrl}
					onResult={handleResult}
					onAgentBindingsResult={handleAgentBindingsResult}
				/>
			))}
			{/* The scroller owns the cards' coordinate space; `isolate` keeps
			    their z-index stacking contained so the pinned "+" button below —
			    outside the scroller, un-scrolled, un-stacked-on — always stays on
			    top instead of getting buried under a raised card. */}
			<div className="absolute inset-0 isolate overflow-auto">
				{/* Clicking the board itself drops focus, so global hotkeys aren't
				    swallowed by whichever terminal was last active. */}
				<button
					type="button"
					aria-label="Deselect card"
					tabIndex={-1}
					className="absolute left-0 top-0 cursor-default"
					style={{
						width: contentExtent.width,
						height: contentExtent.height,
						minWidth: "100%",
						minHeight: "100%",
					}}
					onClick={() => setActiveCard(null)}
				/>
				{cards.length === 0 ? (
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
						<p className="text-sm text-muted-foreground">
							Put any terminal from any project here.
						</p>
						{/* A disabled button gets `pointer-events: none` and never fires a
						    hover, so the title-explains-why contract has to live on a span
						    wrapping it instead. */}
						<span
							className="pointer-events-auto"
							title={isFull ? FULL_REASON : undefined}
						>
							<Button disabled={isFull} onClick={() => setIsAdding(true)}>
								Add a terminal
							</Button>
						</span>
					</div>
				) : (
					cards.map((card) => (
						<BoardCard
							key={card.id}
							card={card}
							title={
								<BoardCardTitle
									card={card}
									sessionTitle={titleByTerminalId.get(card.terminalId)}
								/>
							}
						>
							{card.missing ? (
								<DeadCardTile card={card} />
							) : (
								<BoardTerminal card={card} />
							)}
						</BoardCard>
					))
				)}
			</div>
			{/* Same pointer-events-none-on-disabled issue as the empty-state
			    button above: the title lives on this span, not the Button. */}
			<span
				className="absolute right-3 top-3"
				title={isFull ? FULL_REASON : "Add a terminal"}
			>
				<Button
					variant="outline"
					size="icon"
					aria-label="Add a terminal"
					disabled={isFull}
					onClick={() => setIsAdding(true)}
				>
					<HiPlus className="size-4" />
				</Button>
			</span>
			<AddCardDialog
				open={isAdding}
				onOpenChange={setIsAdding}
				hostUrls={hostUrls}
				sessionsByHost={sessionsByHost}
				bindingsByHost={bindingsByHost}
			/>
		</div>
	);
}
