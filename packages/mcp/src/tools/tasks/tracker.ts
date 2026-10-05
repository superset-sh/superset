import { LinearLookupError } from "@superset/trpc/linear-lookup";
import { z } from "zod";
import type { McpCaller } from "../../caller";

export const trackerInput = z
	.enum(["superset", "linear"])
	.nullish()
	.describe(
		"Work on Superset tasks or Linear issues. Omit to use the organization's task tracker setting. A call reaches one tracker only.",
	);

export type TaskTracker = "superset" | "linear";

export async function resolveTracker(
	caller: McpCaller,
	requested: TaskTracker | null | undefined,
): Promise<TaskTracker> {
	if (requested) return requested;
	const organization = await caller.organization.getActive();
	return organization?.taskTracker ?? "superset";
}

export type ResolvedTask =
	| {
			tracker: "superset";
			task: NonNullable<Awaited<ReturnType<McpCaller["task"]["byIdOrSlug"]>>>;
	  }
	| { tracker: "linear"; issueId: string };

export async function resolveTask(
	caller: McpCaller,
	idOrSlug: string,
	requested: TaskTracker | null | undefined,
): Promise<ResolvedTask> {
	if ((await resolveTracker(caller, requested)) === "linear") {
		return { tracker: "linear", issueId: idOrSlug };
	}
	const task = await caller.task.byIdOrSlug(idOrSlug);
	if (!task) throw new Error(`Task not found: ${idOrSlug}`);
	return { tracker: "superset", task };
}

export function rejectUnsupported(fields: Record<string, unknown>) {
	const passed = Object.entries(fields)
		.filter(([, value]) => value != null && value !== false)
		.map(([name]) => name);
	if (passed.length > 0) {
		throw new Error(
			`Not supported for Linear issues: ${passed.join(", ")}. Pass tracker: "superset" to work on Superset tasks.`,
		);
	}
}

export function withLookupHint<T>(lookup: () => T): T {
	try {
		return lookup();
	} catch (error) {
		if (error instanceof LinearLookupError) {
			throw new Error(`${error.message}. ${error.hint}`);
		}
		throw error;
	}
}
