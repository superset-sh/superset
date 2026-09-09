import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface QuickPreset {
	id: string;
	emoji: string;
	accent: string;
	body: MessageDescriptor;
}

export const DELETE_BODY = msg({ message: "Delete this" });
export const APPROVE_BODY = msg({ message: "Looks good" });

export const QUICK_PRESETS: QuickPreset[] = [
	{
		id: "clarify",
		emoji: "❓",
		accent: "bg-orange-500",
		body: msg({ message: "Clarify this" }),
	},
	{
		id: "overview",
		emoji: "🗺️",
		accent: "bg-violet-500",
		body: msg({ message: "Missing overview" }),
	},
	{
		id: "verify",
		emoji: "🔍",
		accent: "bg-orange-500",
		body: msg({ message: "Verify this" }),
	},
	{
		id: "example",
		emoji: "🔬",
		accent: "bg-sky-500",
		body: msg({ message: "Give me an example" }),
	},
	{
		id: "patterns",
		emoji: "🎨",
		accent: "bg-sky-500",
		body: msg({ message: "Match existing patterns" }),
	},
	{
		id: "alternatives",
		emoji: "🔄",
		accent: "bg-pink-500",
		body: msg({ message: "Consider alternatives" }),
	},
	{
		id: "regression",
		emoji: "📉",
		accent: "bg-orange-500",
		body: msg({ message: "Ensure no regression" }),
	},
	{
		id: "scope",
		emoji: "🚫",
		accent: "bg-red-500",
		body: msg({ message: "Out of scope" }),
	},
	{
		id: "tests",
		emoji: "📝",
		accent: "bg-sky-500",
		body: msg({ message: "Needs tests" }),
	},
	{
		id: "approve",
		emoji: "👍",
		accent: "bg-emerald-500",
		body: msg({ message: "Nice approach" }),
	},
];

export const PRESET_KEYS = "1234567890";
