import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

interface AchievementCopy {
	name: MessageDescriptor;
	detail: MessageDescriptor;
}

export const ACHIEVEMENT_COPY: Record<string, AchievementCopy> = {
	"ship-it": {
		name: msg({ message: "Ship It" }),
		detail: msg({
			message: "agent PRs merged",
		}),
	},
	"two-hands": {
		name: msg({
			message: "Two Hands",
		}),
		detail: msg({
			message: "days running two agents at once",
		}),
	},
	"plant-floor": {
		name: msg({
			message: "Plant Floor",
		}),
		detail: msg({
			message: "days running three agents at once",
		}),
	},
	"whole-task": {
		name: msg({
			message: "Whole Task",
		}),
		detail: msg({
			message: "tokens per session, trailing 30 days",
		}),
	},
	thirty: {
		name: msg({ message: "Thirty" }),
		detail: msg({
			message: "consecutive active days",
		}),
	},
	efficient: {
		name: msg({
			message: "Efficient",
		}),
		detail: msg({
			message: "per merged PR, lower is better",
		}),
	},
	"run-01": {
		name: msg({ message: "Run 01" }),
		detail: msg({
			message: "Cleared Operator inside the Run 01 window",
		}),
	},
	"day-one": {
		name: msg({ message: "Day One" }),
		detail: msg({
			message: "One of the first hundred on the board",
		}),
	},
	tokens: {
		name: msg({ message: "Tokens" }),
		detail: msg({
			message: "Total tokens published",
		}),
	},
	spend: {
		name: msg({ message: "Spend" }),
		detail: msg({
			message: "API-equivalent cost",
		}),
	},
	sessions: {
		name: msg({
			message: "Sessions",
		}),
		detail: msg({
			message: "Total agent sessions",
		}),
	},
};
