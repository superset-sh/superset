import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { AxisName } from "@superset/trpc/leaderboard-tier";

export const AXIS_LABELS: Record<AxisName, MessageDescriptor> = {
	width: msg({ message: "Width" }),
	depth: msg({ message: "Depth" }),
	output: msg({ message: "Output" }),
	sustain: msg({ message: "Sustain" }),
	cost: msg({ message: "Cost" }),
};

export const AXIS_UNITS: Record<AxisName, MessageDescriptor> = {
	width: msg({ message: "at once" }),
	depth: msg({ message: "per session" }),
	output: msg({ message: "PRs a week" }),
	sustain: msg({ message: "active days" }),
	cost: msg({ message: "per merged PR" }),
};

export const AXIS_HINTS: Record<AxisName, MessageDescriptor> = {
	width: msg({
		message: "Agents running at once",
	}),
	depth: msg({
		message: "Tokens per session",
	}),
	output: msg({
		message: "Agent PRs merged per week",
	}),
	sustain: msg({
		message: "Active days in the last 30",
	}),
	cost: msg({
		message: "Cost per merged PR",
	}),
};
