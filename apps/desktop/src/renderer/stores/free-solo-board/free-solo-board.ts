import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/** Each card is a live xterm plus its own WebSocket, so this is a resource
 *  limit before it is a storage one — and it is what bounds the persisted
 *  key (apps/desktop/AGENTS.md).
 *  ponytail: flat cap, revisit only if someone actually hits it. */
export const MAX_CARDS = 16;

export const DEFAULT_CARD_WIDTH = 640;
export const DEFAULT_CARD_HEIGHT = 420;
export const MIN_CARD_WIDTH = 280;
export const MIN_CARD_HEIGHT = 160;

/** Offsets each new card so a burst of adds doesn't land in one pile. */
const CASCADE_STEP = 32;
const CASCADE_WRAP = 8;

export type CardMissingReason = "workspace" | "terminal";

export interface BoardCard {
	/** Stable across reloads: this is the `instanceId` in
	 *  terminalRuntimeRegistry, and a new one costs the card its scrollback. */
	id: string;
	workspaceId: string;
	terminalId: string;
	/** Card added as "new terminal": the WS attach spawns the session
	 *  host-side (`?create=1`) instead of an awaited mutation. */
	createOnAttach?: boolean;
	x: number;
	y: number;
	w: number;
	h: number;
	z: number;
	/** Set by reconciliation. Runtime-only — never persisted. */
	missing?: CardMissingReason;
}

export interface AddCardInput {
	workspaceId: string;
	terminalId: string;
	createOnAttach?: boolean;
	/** Replaces the cascade position and the default size. Used when a card
	 *  stands in for one being removed (DeadCardTile's "Start a new terminal
	 *  here"): the replacement needs a fresh card id — that id is the registry
	 *  instanceId, and reusing it would keep the old runtime — but "here" has
	 *  to mean the same spot at the same size. */
	at?: { x: number; y: number; w: number; h: number };
}

interface FreeSoloBoardState {
	cards: BoardCard[];
	activeCardId: string | null;
	/** Returns the card id, or null when the cap is reached. A terminal
	 *  already on the board returns its existing card raised, never a
	 *  second view of one PTY. */
	addCard: (input: AddCardInput) => string | null;
	removeCard: (cardId: string) => void;
	moveCard: (cardId: string, x: number, y: number) => void;
	resizeCard: (cardId: string, w: number, h: number) => void;
	raiseCard: (cardId: string) => void;
	setActiveCard: (cardId: string | null) => void;
	setMissing: (missingByCardId: Record<string, CardMissingReason>) => void;
	/** Drops the create-on-attach exemption for cards whose session a host has
	 *  now reported live. */
	clearCreateOnAttach: (cardIds: readonly string[]) => void;
	/** Follows an agent auto-resume swapping the pane's terminal. */
	updateCardTerminal: (cardId: string, terminalId: string) => void;
}

/** Restored z values are only meaningful as an order; rewrite them as a dense
 *  0..n-1 sequence so they can't climb forever across sessions. */
export function normalizeZ<T extends { z: number }>(cards: T[]): T[] {
	const order = [...cards].sort((a, b) => a.z - b.z);
	const rank = new Map(order.map((card, index) => [card, index]));
	return cards.map((card) => ({ ...card, z: rank.get(card) ?? 0 }));
}

function topZ(cards: BoardCard[]): number {
	return cards.reduce((max, card) => Math.max(max, card.z), -1);
}

function cascade(count: number): { x: number; y: number } {
	const step = (count % CASCADE_WRAP) * CASCADE_STEP;
	return { x: step, y: step };
}

export const useFreeSoloBoardStore = create<FreeSoloBoardState>()(
	devtools(
		persist(
			(set, get) => ({
				cards: [],
				activeCardId: null,

				addCard: ({ workspaceId, terminalId, createOnAttach, at }) => {
					const { cards } = get();
					const existing = cards.find((card) => card.terminalId === terminalId);
					if (existing) {
						get().raiseCard(existing.id);
						return existing.id;
					}
					if (cards.length >= MAX_CARDS) return null;

					const id = crypto.randomUUID();
					const { x, y } = at ?? cascade(cards.length);
					set({
						cards: [
							...cards,
							{
								id,
								workspaceId,
								terminalId,
								createOnAttach,
								x,
								y,
								w: at?.w ?? DEFAULT_CARD_WIDTH,
								h: at?.h ?? DEFAULT_CARD_HEIGHT,
								z: topZ(cards) + 1,
							},
						],
						activeCardId: id,
					});
					return id;
				},

				removeCard: (cardId) =>
					set((state) => ({
						cards: state.cards.filter((card) => card.id !== cardId),
						activeCardId:
							state.activeCardId === cardId ? null : state.activeCardId,
					})),

				// The frame arms a drag on every title-bar pointerdown and commits
				// on release, so a plain click arrives here with the position the
				// card already has. Same no-op discipline as raiseCard and
				// setMissing: without it a click rebuilds `cards`, re-renders
				// every card and its terminal, and writes the whole board to
				// localStorage.
				moveCard: (cardId, x, y) => {
					const nextX = Math.max(0, x);
					const nextY = Math.max(0, y);
					const card = get().cards.find((c) => c.id === cardId);
					if (!card || (card.x === nextX && card.y === nextY)) return;
					set((state) => ({
						cards: state.cards.map((c) =>
							c.id === cardId ? { ...c, x: nextX, y: nextY } : c,
						),
					}));
				},

				resizeCard: (cardId, w, h) =>
					set((state) => ({
						cards: state.cards.map((card) =>
							card.id === cardId
								? {
										...card,
										w: Math.max(MIN_CARD_WIDTH, Math.round(w)),
										h: Math.max(MIN_CARD_HEIGHT, Math.round(h)),
									}
								: card,
						),
					})),

				// The frame calls this on every pointerdown, including clicks into
				// the card body, so an already-topmost-and-active card must no-op:
				// otherwise every click remaps `cards` and re-renders the board.
				raiseCard: (cardId) => {
					const state = get();
					const card = state.cards.find((c) => c.id === cardId);
					if (
						card &&
						card.z === topZ(state.cards) &&
						state.activeCardId === cardId
					) {
						return;
					}
					set((state) => {
						const next = topZ(state.cards) + 1;
						return {
							cards: state.cards.map((c) =>
								c.id === cardId ? { ...c, z: next } : c,
							),
							activeCardId: cardId,
						};
					});
				},

				setActiveCard: (cardId) => set({ activeCardId: cardId }),

				/** Agent auto-resume replaces a session with a resumed one and
				 *  writes the new id into the pane store; the card has to follow
				 *  or it keeps pointing at a terminal that no longer exists.
				 *  `createOnAttach` is cleared with it: it described the old id,
				 *  and the resumed session already exists. (The host ignores a
				 *  stale flag anyway — it honours create-on-attach only when no
				 *  session row exists at all — so this is hygiene, not a guard.) */
				updateCardTerminal: (cardId, terminalId) => {
					const card = get().cards.find((c) => c.id === cardId);
					// Every notification off the card's pane store runs through here,
					// most of them re-reporting the same terminalId — skip the `set`
					// entirely rather than rebuilding `cards` into an equal-looking
					// array that still re-renders every subscriber.
					if (!card || card.terminalId === terminalId) return;
					set((state) => ({
						cards: state.cards.map((c) =>
							c.id === cardId
								? { ...c, terminalId, createOnAttach: undefined }
								: c,
						),
					}));
				},

				// Reconciliation calls this every settled pass, including no-op
				// ones (nothing actually changed). `cards.map` always allocates a
				// new array even when every element comes back unchanged, and
				// zustand notifies subscribers on that new reference regardless of
				// content — a `state => state.cards` selector would see a "new"
				// array and re-render, re-running any effect that depends on
				// `cards` right back into this call. Return the same `state` when
				// nothing changed, the same no-op discipline raiseCard and
				// updateCardTerminal already follow.
				/** `createOnAttach` means "no session exists yet", which is why
				 *  reconciliation exempts such a card from the dead-tile verdict.
				 *  Once a host actually lists the session that stops being true,
				 *  and the flag has to go or the exemption is permanent: the card
				 *  never shows the tile when its session is closed, and every
				 *  reattach keeps sending `?create=1`, spawning a fresh shell
				 *  instead of reattaching to the one that's there.
				 *
				 *  Same return-`state`-unchanged discipline as setMissing:
				 *  reconciliation calls this on every settled pass and `cards` is
				 *  one of that effect's dependencies. */
				clearCreateOnAttach: (cardIds) =>
					set((state) => {
						const ids = new Set(cardIds);
						let changed = false;
						const cards = state.cards.map((card) => {
							if (!card.createOnAttach || !ids.has(card.id)) return card;
							changed = true;
							const { createOnAttach: _dropped, ...rest } = card;
							return rest;
						});
						return changed ? { cards } : state;
					}),

				setMissing: (missingByCardId) =>
					set((state) => {
						let changed = false;
						const cards = state.cards.map((card) => {
							const missing = missingByCardId[card.id];
							if (missing === card.missing) return card;
							changed = true;
							const { missing: _dropped, ...rest } = card;
							return missing ? { ...rest, missing } : rest;
						});
						return changed ? { cards } : state;
					}),
			}),
			{
				name: "free-solo-board",
				version: 1,
				// Focus is a per-session concern, and `missing` is recomputed on
				// every load — persisting either would restore a stale view.
				partialize: (state) => ({
					cards: state.cards.map(({ missing: _missing, ...card }) => card),
				}),
				// Restored z values only carry an order; rewrite them densely on
				// merge rather than mutating hydrated state in place.
				// `cards` is the only persisted field, and it is rewritten right
				// here — spreading `persisted` first would only be overwritten.
				merge: (persisted, current) => ({
					...current,
					cards: normalizeZ(
						(persisted as { cards?: BoardCard[] })?.cards ?? [],
					),
				}),
			},
		),
		{ name: "free-solo-board" },
	),
);
