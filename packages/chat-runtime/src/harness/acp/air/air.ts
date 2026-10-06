import { z } from "zod";

/**
 * JetBrains AIR is the `_meta` extension claude-agent-acp and codex-acp both
 * speak for work that outlives a tool call: background processes and subagent
 * sessions. Each is reported only to a client that advertises it.
 */
export const AIR_CLIENT_META = {
	jetbrains: {
		air: { version: 1, capabilities: ["asyncTasks", "nativeSubagentSessions"] },
	},
};

export const AIR_ASYNC_TASK_STOP_METHOD = "_session/async_task/stop";

export const airAsyncTaskSpawnedSchema = z.looseObject({
	asyncTaskId: z.string().min(1),
	name: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	canStop: z.boolean().nullable().optional(),
});

export const airAsyncTaskProgressSchema = z.looseObject({
	asyncTaskId: z.string().min(1),
	summary: z.string().nullable().optional(),
});

export const airAsyncTaskStateSchema = z.looseObject({
	asyncTaskId: z.string().min(1),
	state: z.string(),
});

export const airSubagentSpawnedSchema = z.looseObject({
	subagentSessionId: z.string().min(1),
	name: z.string().nullable().optional(),
	task: z.string().nullable().optional(),
});

export const airSubagentStateSchema = z.looseObject({
	subagentSessionId: z.string().min(1),
	state: z.string(),
});

const RUNNING_STATES = new Set(["running", "pending", "paused", "stopping"]);

export function isTerminalAirState(state: string): boolean {
	return !RUNNING_STATES.has(state);
}

const SUBAGENT_CONTROL_TOOLS = new Set(["Agent", "Task"]);

const subagentControlMetaSchema = z.looseObject({
	_meta: z.looseObject({
		jetbrains: z
			.looseObject({
				air: z.looseObject({ subagent: z.boolean().optional() }).optional(),
			})
			.optional(),
		claudeCode: z.looseObject({ toolName: z.string().optional() }).optional(),
	}),
});

export function isSubagentControlCall(raw: unknown): boolean {
	const parsed = subagentControlMetaSchema.safeParse(raw);
	if (!parsed.success) return false;
	const { jetbrains, claudeCode } = parsed.data._meta;
	return (
		jetbrains?.air?.subagent === true ||
		SUBAGENT_CONTROL_TOOLS.has(claudeCode?.toolName ?? "")
	);
}
