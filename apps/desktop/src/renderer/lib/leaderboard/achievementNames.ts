import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const ACHIEVEMENT_NAMES: Record<string, MessageDescriptor> = {
	"ship-it": msg({ message: "Ship It" }),
	"two-hands": msg({
		message: "Two Hands",
	}),
	"plant-floor": msg({
		message: "Plant Floor",
	}),
	"whole-task": msg({
		message: "Whole Task",
	}),
	thirty: msg({ message: "Thirty" }),
	efficient: msg({
		message: "Efficient",
	}),
	"run-01": msg({ message: "Run 01" }),
	"day-one": msg({ message: "Day One" }),
	tokens: msg({ message: "Tokens" }),
	spend: msg({ message: "Spend" }),
	sessions: msg({
		message: "Sessions",
	}),
};
