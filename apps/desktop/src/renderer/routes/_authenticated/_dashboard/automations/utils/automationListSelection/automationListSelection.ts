import type { SelectAutomation } from "@superset/db/schema";

export type AutomationListRow = Omit<SelectAutomation, "prompt"> & {
	prompt?: string;
	scheduleText?: string;
};

function timestamp(value: Date | string | null | undefined): number {
	if (!value) return 0;
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : 0;
}

function pickFreshestAutomation(
	current: AutomationListRow,
	incoming: AutomationListRow,
): AutomationListRow {
	const currentTime = timestamp(current.updatedAt);
	const incomingTime = timestamp(incoming.updatedAt);
	if (incomingTime < currentTime) return current;
	return {
		...current,
		...incoming,
		prompt: incoming.prompt ?? current.prompt,
	};
}

export function mergeAutomationListRows(
	liveRows: AutomationListRow[],
	freshRows: AutomationListRow[],
): AutomationListRow[] {
	const byId = new Map<string, AutomationListRow>();
	for (const row of liveRows) {
		byId.set(row.id, row);
	}
	for (const row of freshRows) {
		const current = byId.get(row.id);
		byId.set(row.id, current ? pickFreshestAutomation(current, row) : row);
	}
	return Array.from(byId.values()).sort(
		(a, b) => timestamp(b.createdAt) - timestamp(a.createdAt),
	);
}
