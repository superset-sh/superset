import { z } from "zod";

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
	z.object({ type: z.literal("close"), paneId }),
	z.object({
		type: z.literal("move"),
		paneId,
		targetPaneId: paneId,
		direction,
	}),
	z.object({ type: z.literal("moveToNewTab"), paneId }),
	z.object({ type: z.literal("swap"), paneId, withPaneId: paneId }),
]);

export type PaneLayoutOp = z.infer<typeof paneLayoutOpSchema>;

export const paneLayoutRequestSchema = z.object({
	workspaceId: z.string().min(1),
	op: paneLayoutOpSchema,
});

export type PaneLayoutRequest = z.infer<typeof paneLayoutRequestSchema>;

/** `ratio` is the share of the split given to `first`. */
export type PaneLayoutNode =
	| { type: "pane"; paneId: string }
	| {
			type: "split";
			direction: "horizontal" | "vertical";
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
