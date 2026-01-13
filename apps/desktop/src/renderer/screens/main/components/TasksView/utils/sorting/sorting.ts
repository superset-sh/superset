import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";

// Status type ordering for table groups (Linear style: in progress → todo → backlog → done → canceled)
const STATUS_TYPE_ORDER: Record<string, number> = {
	started: 0,
	unstarted: 1,
	backlog: 2,
	completed: 3,
	canceled: 4,
};

// Status type ordering for dropdowns (workflow order: backlog → todo → in progress → done → canceled)
const STATUS_TYPE_DROPDOWN_ORDER: Record<string, number> = {
	backlog: 0,
	unstarted: 1,
	started: 2,
	completed: 3,
	canceled: 4,
};

// Priority ordering for task sorting (urgent at top, none at bottom)
const PRIORITY_ORDER: Record<string, number> = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4,
};

// All priorities in dropdown order (none → urgent → high → medium → low)
export const ALL_PRIORITIES = [
	"none",
	"urgent",
	"high",
	"medium",
	"low",
] as const;

/**
 * Get sort order for a status type (table groups).
 * Unknown types are sorted to the end.
 */
function getStatusTypeOrder(type: string): number {
	return STATUS_TYPE_ORDER[type] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Get sort order for a status type (dropdowns).
 * Unknown types are sorted to the end.
 */
function getStatusTypeDropdownOrder(type: string): number {
	return STATUS_TYPE_DROPDOWN_ORDER[type] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Get sort order for a priority.
 * Unknown priorities are sorted to the end.
 */
function getPriorityOrder(
	priority: "urgent" | "high" | "medium" | "low" | "none",
): number {
	return PRIORITY_ORDER[priority] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Compare two tasks for sorting in table.
 * Sort order: status type → status position → priority
 */
export function compareTasks(
	a: SelectTask & { status: SelectTaskStatus },
	b: SelectTask & { status: SelectTaskStatus },
): number {
	// 1. Sort by status type (determines group order)
	const typeOrderA = getStatusTypeOrder(a.status.type);
	const typeOrderB = getStatusTypeOrder(b.status.type);
	if (typeOrderA !== typeOrderB) {
		return typeOrderA - typeOrderB;
	}

	// 2. Within same status type, sort by status position (workflow order)
	if (a.status.position !== b.status.position) {
		return a.status.position - b.status.position;
	}

	// 3. Within same status, sort by priority
	const priorityOrderA = getPriorityOrder(a.priority);
	const priorityOrderB = getPriorityOrder(b.priority);
	return priorityOrderA - priorityOrderB;
}

/**
 * Compare two statuses for dropdown sorting.
 * Sort order: status type (workflow order) → status position
 */
export function compareStatusesForDropdown(
	a: SelectTaskStatus,
	b: SelectTaskStatus,
): number {
	// 1. Sort by status type in workflow order (backlog → unstarted → started → completed → canceled)
	const typeOrderA = getStatusTypeDropdownOrder(a.type);
	const typeOrderB = getStatusTypeDropdownOrder(b.type);
	if (typeOrderA !== typeOrderB) {
		return typeOrderA - typeOrderB;
	}

	// 2. Within same type, sort by position
	return a.position - b.position;
}

/**
 * Compare two priorities for dropdown sorting.
 * Sort order: urgent → high → medium → low → none
 * (Same order as task sorting)
 */
export function comparePrioritiesForDropdown(
	a: "urgent" | "high" | "medium" | "low" | "none",
	b: "urgent" | "high" | "medium" | "low" | "none",
): number {
	return getPriorityOrder(a) - getPriorityOrder(b);
}
