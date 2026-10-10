import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RunStatus } from "../RunStatusDot";

export interface AutomationListRow {
	id: string;
	name: MessageDescriptor;
	project: string | null;
	schedule: MessageDescriptor;
	nextRun: MessageDescriptor | null;
	lastRun: { status: RunStatus; ago: MessageDescriptor };
}

export const ROWS: AutomationListRow[] = [
	{
		id: "standup",
		name: msg({ message: "Morning standup summary" }),
		project: "superset",
		schedule: msg({ message: "Weekdays at 9:00 AM" }),
		nextRun: msg({ message: "in 14h" }),
		lastRun: { status: "created", ago: msg({ message: "10h ago" }) },
	},
	{
		id: "audit",
		name: msg({ message: "Security audit" }),
		project: "api",
		schedule: msg({ message: "Every day at 3:00 AM" }),
		nextRun: msg({ message: "in 8h" }),
		lastRun: { status: "failed", ago: msg({ message: "16h ago" }) },
	},
	{
		id: "deps",
		name: msg({ message: "Dependency sweep" }),
		project: "superset",
		schedule: msg({ message: "Every Monday at 8:00 AM" }),
		nextRun: msg({ message: "in 3d" }),
		lastRun: { status: "created", ago: msg({ message: "4d ago" }) },
	},
	{
		id: "release",
		name: msg({ message: "Release notes draft" }),
		project: "web",
		schedule: msg({ message: "Every Friday at 5:00 PM" }),
		nextRun: msg({ message: "in 2d" }),
		lastRun: { status: "created", ago: msg({ message: "5d ago" }) },
	},
	{
		id: "inbox",
		name: msg({ message: "Inbox triage" }),
		project: null,
		schedule: msg({ message: "Hourly" }),
		nextRun: null,
		lastRun: { status: "created", ago: msg({ message: "2d ago" }) },
	},
];

export const SPARKLINE = [
	2, 3, 1, 4, 0, 3, 2, 5, 1, 3, 4, 2, 0, 3, 5, 2, 4, 1, 3, 2, 4, 3, 1, 5, 2, 3,
	4, 2,
].map((count, slot) => ({ slot, count }));
