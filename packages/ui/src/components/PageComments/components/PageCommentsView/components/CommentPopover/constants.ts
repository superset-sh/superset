import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	Ban,
	Blocks,
	CircleQuestionMark,
	FlaskConical,
	type LucideIcon,
	Map as MapIcon,
	Search,
	Shuffle,
	TestTube,
	ThumbsUp,
	TrendingDown,
} from "lucide-react";

export interface QuickPreset {
	id: string;
	icon: LucideIcon;
	body: MessageDescriptor;
}

export const DELETE_BODY = msg({ message: "Delete this" });
export const APPROVE_BODY = msg({ message: "Looks good" });

export const DELETE_INTENT = "delete" as const;
export const APPROVE_INTENT = "approve" as const;

export const QUICK_PRESETS: QuickPreset[] = [
	{
		id: "clarify",
		icon: CircleQuestionMark,
		body: msg({ message: "Clarify this" }),
	},
	{ id: "overview", icon: MapIcon, body: msg({ message: "Missing overview" }) },
	{ id: "verify", icon: Search, body: msg({ message: "Verify this" }) },
	{
		id: "example",
		icon: FlaskConical,
		body: msg({ message: "Give me an example" }),
	},
	{
		id: "patterns",
		icon: Blocks,
		body: msg({ message: "Match existing patterns" }),
	},
	{
		id: "alternatives",
		icon: Shuffle,
		body: msg({ message: "Consider alternatives" }),
	},
	{
		id: "regression",
		icon: TrendingDown,
		body: msg({ message: "Ensure no regression" }),
	},
	{ id: "scope", icon: Ban, body: msg({ message: "Out of scope" }) },
	{ id: "tests", icon: TestTube, body: msg({ message: "Needs tests" }) },
	{ id: "approve", icon: ThumbsUp, body: msg({ message: "Nice approach" }) },
];

export const PRESET_KEYS = "1234567890";
