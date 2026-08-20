import { beforeEach, describe, expect, it } from "bun:test";
import {
	DEFAULT_CARD_HEIGHT,
	DEFAULT_CARD_WIDTH,
	MAX_CARDS,
	MIN_CARD_HEIGHT,
	MIN_CARD_WIDTH,
	normalizeZ,
	useFreeSoloBoardStore,
} from "./free-solo-board";

beforeEach(() => {
	useFreeSoloBoardStore.setState({ cards: [], activeCardId: null });
});

const add = (terminalId: string, workspaceId = "ws-1") =>
	useFreeSoloBoardStore.getState().addCard({ workspaceId, terminalId });

describe("free-solo-board", () => {
	it("adds a card at the default size and makes it active", () => {
		const cardId = add("term-1");
		const state = useFreeSoloBoardStore.getState();
		expect(cardId).not.toBeNull();
		expect(state.cards).toHaveLength(1);
		expect(state.cards[0]?.w).toBe(DEFAULT_CARD_WIDTH);
		expect(state.cards[0]?.h).toBe(DEFAULT_CARD_HEIGHT);
		expect(state.activeCardId).toBe(cardId);
	});

	it("cascades each new card so they do not stack exactly", () => {
		add("term-1");
		add("term-2");
		const [first, second] = useFreeSoloBoardStore.getState().cards;
		expect(second?.x).toBeGreaterThan(first?.x ?? 0);
		expect(second?.y).toBeGreaterThan(first?.y ?? 0);
	});

	it("refuses a second card for a terminal already on the board and raises the existing one", () => {
		const firstId = add("term-1");
		add("term-2");
		const againId = add("term-1");
		const state = useFreeSoloBoardStore.getState();
		expect(againId).toBe(firstId);
		expect(state.cards).toHaveLength(2);
		expect(state.activeCardId).toBe(firstId);
		const raised = state.cards.find((card) => card.id === firstId);
		const other = state.cards.find((card) => card.id !== firstId);
		expect(raised?.z).toBeGreaterThan(other?.z ?? 0);
	});

	it("stops adding at the cap", () => {
		for (let index = 0; index < MAX_CARDS; index++) add(`term-${index}`);
		expect(useFreeSoloBoardStore.getState().cards).toHaveLength(MAX_CARDS);
		expect(add("one-too-many")).toBeNull();
		expect(useFreeSoloBoardStore.getState().cards).toHaveLength(MAX_CARDS);
	});

	it("clamps a resize to the minimum card size", () => {
		const cardId = add("term-1");
		useFreeSoloBoardStore.getState().resizeCard(cardId as string, 10, 10);
		const card = useFreeSoloBoardStore.getState().cards[0];
		expect(card?.w).toBe(MIN_CARD_WIDTH);
		expect(card?.h).toBe(MIN_CARD_HEIGHT);
	});

	it("never moves a card off the top-left of the board", () => {
		const cardId = add("term-1") as string;
		// Move it off the origin first, or the clamp below would be a no-op
		// against the cascade position this card already starts at.
		useFreeSoloBoardStore.getState().moveCard(cardId, 100, 100);
		useFreeSoloBoardStore.getState().moveCard(cardId, -50, -50);
		const card = useFreeSoloBoardStore.getState().cards[0];
		expect(card?.x).toBe(0);
		expect(card?.y).toBe(0);
	});

	it("no-ops a move to the position the card already holds, so a plain title-bar click can't rewrite the board", () => {
		// The frame sets a drag origin on every title-bar pointerdown and
		// commits on release, so a click with no movement lands here with the
		// unchanged position. Without this guard that rebuilds `cards`,
		// re-renders every card and its terminal, and writes the whole board
		// to localStorage — for a click.
		const cardId = add("term-1") as string;
		const before = useFreeSoloBoardStore.getState().cards;
		const card = before[0];
		useFreeSoloBoardStore
			.getState()
			.moveCard(cardId, card?.x ?? 0, card?.y ?? 0);
		expect(useFreeSoloBoardStore.getState().cards).toBe(before);
	});

	it("no-ops a move that clamps back onto the position the card already holds", () => {
		const cardId = add("term-1") as string;
		const before = useFreeSoloBoardStore.getState().cards;
		useFreeSoloBoardStore.getState().moveCard(cardId, -10, -10);
		expect(useFreeSoloBoardStore.getState().cards).toBe(before);
	});

	it("removes a card and clears the active id when it was active", () => {
		const cardId = add("term-1");
		useFreeSoloBoardStore.getState().removeCard(cardId as string);
		const state = useFreeSoloBoardStore.getState();
		expect(state.cards).toHaveLength(0);
		expect(state.activeCardId).toBeNull();
	});

	it("marks cards as missing and clears ones no longer reported", () => {
		const cardId = add("term-1") as string;
		useFreeSoloBoardStore.getState().setMissing({ [cardId]: "terminal" });
		expect(useFreeSoloBoardStore.getState().cards[0]?.missing).toBe("terminal");
		useFreeSoloBoardStore.getState().setMissing({});
		expect(useFreeSoloBoardStore.getState().cards[0]?.missing).toBeUndefined();
	});

	it("no-ops setMissing when nothing actually changed, so a reconciliation effect keyed on `cards` can't refire itself forever", () => {
		add("term-1");
		// Steady state: reconciliation calls setMissing({}) every settled pass,
		// most of which report nothing new. `cards` is an effect dependency in
		// useBoardReconciliation — a fresh array reference here every call would
		// re-render, which re-runs that effect, which calls setMissing again,
		// unbounded.
		useFreeSoloBoardStore.getState().setMissing({});
		const settled = useFreeSoloBoardStore.getState().cards;
		useFreeSoloBoardStore.getState().setMissing({});
		expect(useFreeSoloBoardStore.getState().cards).toBe(settled);
	});

	it("follows a terminal swapped in by agent auto-resume", () => {
		const cardId = add("term-1") as string;
		useFreeSoloBoardStore.getState().updateCardTerminal(cardId, "term-resumed");
		expect(useFreeSoloBoardStore.getState().cards[0]?.terminalId).toBe(
			"term-resumed",
		);
	});

	it("no-ops updating a card to the terminal it already points at, leaving cards unchanged", () => {
		const cardId = add("term-1") as string;
		const before = useFreeSoloBoardStore.getState().cards;
		useFreeSoloBoardStore.getState().updateCardTerminal(cardId, "term-1");
		expect(useFreeSoloBoardStore.getState().cards).toBe(before);
	});

	it("drops createOnAttach once the terminal is swapped, so a reload doesn't respawn", () => {
		const cardId = useFreeSoloBoardStore.getState().addCard({
			workspaceId: "ws-1",
			terminalId: "term-1",
			createOnAttach: true,
		}) as string;
		useFreeSoloBoardStore.getState().updateCardTerminal(cardId, "term-2");
		expect(
			useFreeSoloBoardStore.getState().cards[0]?.createOnAttach,
		).toBeUndefined();
	});

	it("clears createOnAttach once the card's own host confirms the session is live", () => {
		// The flag exempts a card from the dead-tile verdict. Left set forever
		// it never expires, so a card added as "new terminal" never shows the
		// tile when its session is closed — and every reattach carries
		// `?create=1`, resurrecting a fresh shell instead of reattaching.
		const cardId = useFreeSoloBoardStore.getState().addCard({
			workspaceId: "ws-1",
			terminalId: "term-1",
			createOnAttach: true,
		}) as string;
		useFreeSoloBoardStore.getState().clearCreateOnAttach([cardId]);
		expect(
			useFreeSoloBoardStore.getState().cards[0]?.createOnAttach,
		).toBeUndefined();
	});

	it("no-ops clearCreateOnAttach when no listed card still carries the flag", () => {
		// Reconciliation calls this every settled pass; `cards` is one of that
		// effect's dependencies, so a fresh array on a no-op pass is the same
		// unbounded loop setMissing already guards against.
		const cardId = add("term-1") as string;
		const before = useFreeSoloBoardStore.getState().cards;
		useFreeSoloBoardStore.getState().clearCreateOnAttach([cardId]);
		expect(useFreeSoloBoardStore.getState().cards).toBe(before);
	});

	it("keeps a replaced card's geometry when one is added in place of another", () => {
		// DeadCardTile's "Start a new terminal here" needs a fresh card id (it
		// is the registry instanceId), but "here" has to mean the same spot
		// and the same size.
		const at = { x: 240, y: 180, w: 900, h: 500 };
		useFreeSoloBoardStore
			.getState()
			.addCard({ workspaceId: "ws-1", terminalId: "term-1", at });
		expect(useFreeSoloBoardStore.getState().cards[0]).toMatchObject(at);
	});

	it("renormalizes z so restored values cannot drift upward forever", () => {
		const normalized = normalizeZ([
			{ id: "a", z: 900 },
			{ id: "b", z: 12 },
			{ id: "c", z: 4001 },
		] as never);
		expect(normalized.map((card) => card.z)).toEqual([1, 0, 2]);
	});

	it("no-ops raising a card already topmost and active, leaving cards unchanged", () => {
		const cardId = add("term-1") as string;
		const before = useFreeSoloBoardStore.getState().cards;
		useFreeSoloBoardStore.getState().raiseCard(cardId);
		expect(useFreeSoloBoardStore.getState().cards).toBe(before);
	});

	it("still raises a card that is not already topmost", () => {
		const firstId = add("term-1") as string;
		const secondId = add("term-2") as string;
		useFreeSoloBoardStore.getState().raiseCard(firstId);
		const state = useFreeSoloBoardStore.getState();
		const first = state.cards.find((card) => card.id === firstId);
		const second = state.cards.find((card) => card.id === secondId);
		expect(first?.z).toBeGreaterThan(second?.z ?? 0);
		expect(state.activeCardId).toBe(firstId);
	});

	it("still raises a card that is topmost but not active (mixed state, distinguishes && from ||)", () => {
		const firstId = add("term-1") as string;
		const secondId = add("term-2") as string;
		// `second` is topmost (added last) but make `first` active without
		// touching z, so `second` is topmost-but-inactive.
		useFreeSoloBoardStore.getState().setActiveCard(firstId);
		const before = useFreeSoloBoardStore.getState().cards;

		useFreeSoloBoardStore.getState().raiseCard(secondId);

		const state = useFreeSoloBoardStore.getState();
		expect(state.cards).not.toBe(before);
		expect(state.activeCardId).toBe(secondId);
		const first = state.cards.find((card) => card.id === firstId);
		const second = state.cards.find((card) => card.id === secondId);
		expect(second?.z).toBeGreaterThan(first?.z ?? 0);
	});
});
