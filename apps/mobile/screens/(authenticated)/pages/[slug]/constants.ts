import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface QuickPreset {
	id: string;
	/** SF Symbol name, drawn by the native menu rather than by us. */
	symbol: string;
	body: MessageDescriptor;
}

export const DELETE_BODY = msg({ message: "Delete this" });
export const APPROVE_BODY = msg({ message: "Looks good" });

export const QUICK_PRESETS: QuickPreset[] = [
	{
		id: "clarify",
		symbol: "questionmark.circle",
		body: msg({ message: "Clarify this" }),
	},
	{ id: "overview", symbol: "map", body: msg({ message: "Missing overview" }) },
	{
		id: "verify",
		symbol: "magnifyingglass",
		body: msg({ message: "Verify this" }),
	},
	{
		id: "example",
		symbol: "flask",
		body: msg({ message: "Give me an example" }),
	},
	{
		id: "patterns",
		symbol: "square.grid.2x2",
		body: msg({ message: "Match existing patterns" }),
	},
	{
		id: "alternatives",
		symbol: "shuffle",
		body: msg({ message: "Consider alternatives" }),
	},
	{
		id: "regression",
		symbol: "chart.line.downtrend.xyaxis",
		body: msg({ message: "Ensure no regression" }),
	},
	{ id: "scope", symbol: "nosign", body: msg({ message: "Out of scope" }) },
	{ id: "tests", symbol: "testtube.2", body: msg({ message: "Needs tests" }) },
	{
		id: "approve",
		symbol: "hand.thumbsup",
		body: msg({ message: "Nice approach" }),
	},
];
