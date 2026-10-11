import { z } from "zod";
import type { AgentRunState } from "./agent-status";

export const PANE_SPLIT_DIRECTIONS = ["right", "left", "down", "up"] as const;
export type PaneSplitDirection = (typeof PANE_SPLIT_DIRECTIONS)[number];

const paneId = z.string().min(1);
const direction = z.enum(PANE_SPLIT_DIRECTIONS);

export const paneLayoutOpSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("list") }),
	z.object({
		type: z.literal("split"),
		paneId,
		direction,
		terminalId: z.string().min(1),
	}),
	z.object({
		type: z.literal("resize"),
		paneId,
		ratio: z.number().gt(0).lt(1),
	}),
	z.object({ type: z.literal("equalize"), tabId: z.string().optional() }),
	z.object({ type: z.literal("focus"), paneId }),
	z.object({
		type: z.literal("close"),
		paneId,
		keepTerminal: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("move"),
		paneId,
		targetPaneId: paneId,
		direction,
	}),
	z.object({ type: z.literal("moveToNewTab"), paneId }),
	z.object({ type: z.literal("newTab"), terminalId: z.string().min(1) }),
	z.object({ type: z.literal("swap"), paneId, withPaneId: paneId }),
]);

export type PaneLayoutOp = z.infer<typeof paneLayoutOpSchema>;

export const paneLayoutRequestSchema = z.object({
	workspaceId: z.string().min(1),
	op: paneLayoutOpSchema,
});

export type PaneLayoutRequest = z.infer<typeof paneLayoutRequestSchema>;

/**
 * `row` puts `first` left of `second`; `column` puts it above, as in CSS
 * flexbox. `ratio` is the share given to `first`.
 */
export type PaneLayoutNode =
	| { type: "pane"; paneId: string }
	| {
			type: "split";
			direction: "row" | "column";
			ratio: number;
			first: PaneLayoutNode;
			second: PaneLayoutNode;
	  };

export interface PaneLayoutPane {
	id: string;
	kind: string;
	title: string | null;
	terminalId: string | null;
	active: boolean;
	/** Filled in by the host for terminal panes: the shell's or the user's title. */
	terminalTitle?: string | null;
	/** Filled in by the host when an agent runs in the pane's terminal. */
	agent?: { id: string; state: AgentRunState } | null;
}

export interface PaneLayoutTab {
	id: string;
	title: string | null;
	active: boolean;
	activePaneId: string | null;
	layout: PaneLayoutNode;
	panes: PaneLayoutPane[];
}

export interface PaneLayoutSnapshot {
	activeTabId: string | null;
	tabs: PaneLayoutTab[];
}

export interface PaneLayoutOpResult {
	paneId: string | null;
	tabId: string | null;
	layout: PaneLayoutSnapshot;
}

export const PANE_LAYOUT_ERROR_CODES = [
	"NOT_FOUND",
	"BAD_REQUEST",
	"PRECONDITION_FAILED",
] as const;
export type PaneLayoutErrorCode = (typeof PANE_LAYOUT_ERROR_CODES)[number];
