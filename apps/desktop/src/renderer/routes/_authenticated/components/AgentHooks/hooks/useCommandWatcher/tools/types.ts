import type { SelectProject, SelectWorkspace } from "@superset/local-db";
import type { electronTrpc } from "renderer/lib/electron-trpc";
import type { z } from "zod";

export interface CommandResult<
	TData extends Record<string, unknown> = Record<string, unknown>,
> {
	success: boolean;
	data?: TData;
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
}): CommandResult<Record<string, unknown>> {
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
	terminalCreateOrAttach: ReturnType<
		typeof electronTrpc.terminal.createOrAttach.useMutation
	>;
	terminalWrite: ReturnType<typeof electronTrpc.terminal.write.useMutation>;
	// Query helpers
	refetchWorkspaces: () => Promise<unknown>;
	getWorkspaces: () => SelectWorkspace[] | undefined;
	getProjects: () => SelectProject[] | undefined;
	getActiveWorkspaceId: () => string | null;
	getWorktreePathByWorkspaceId: (workspaceId: string) => string | undefined;
}

// Tool definition with schema and execute function
export interface ToolDefinition<
	T extends z.ZodType,
	TResult extends Record<string, unknown> = Record<string, unknown>,
> {
	name: string;
	schema: T;
	execute: (
		params: z.infer<T>,
		ctx: ToolContext,
	) => Promise<CommandResult<TResult>>;
}
