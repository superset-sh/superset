import type { SelectProject, SelectWorkspace } from "@superset/local-db";
import type { electronTrpc } from "renderer/lib/electron-trpc";
import type { z } from "zod";

export interface CommandResult {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
}

export interface BulkItemError {
	index: number;
	error: string;
	[key: string]: unknown;
}

export function buildBulkResult<T>({
	items,
	errors,
	itemKey,
	allFailedMessage,
	total,
}: {
	items: T[];
	errors: BulkItemError[];
	itemKey: string;
	allFailedMessage: string;
	total: number;
}): CommandResult {
	const data: Record<string, unknown> = {
		[itemKey]: items,
		summary: { total, succeeded: items.length, failed: errors.length },
	};
	if (errors.length > 0) data.errors = errors;
	return {
		success: items.length > 0,
		data,
		error: items.length === 0 ? allFailedMessage : undefined,
	};
}

// Available mutations and queries passed to tool handlers
export interface ToolContext {
	// Mutations
	createWorktree: ReturnType<typeof electronTrpc.workspaces.create.useMutation>;
	setActive: ReturnType<typeof electronTrpc.workspaces.setActive.useMutation>;
	deleteWorkspace: ReturnType<
		typeof electronTrpc.workspaces.delete.useMutation
	>;
	updateWorkspace: ReturnType<
		typeof electronTrpc.workspaces.update.useMutation
	>;
	// Query helpers
	refetchWorkspaces: () => Promise<unknown>;
	getWorkspaces: () => SelectWorkspace[] | undefined;
	getProjects: () => SelectProject[] | undefined;
	getActiveWorkspaceId: () => string | null;
	// Navigation
	navigateToWorkspace: (workspaceId: string) => Promise<void>;
}

// Tool definition with schema and execute function
export interface ToolDefinition<T extends z.ZodType> {
	name: string;
	schema: T;
	execute: (params: z.infer<T>, ctx: ToolContext) => Promise<CommandResult>;
}
