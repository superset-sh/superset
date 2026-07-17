import {
	type AgentDefinitionId,
	BUILTIN_AGENT_IDS,
} from "@superset/shared/agent-catalog";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createTerminalSessionInternal,
	disposeSessionAndWait,
} from "../../../terminal/terminal";
import type {
	TerminalAgentBinding,
	TerminalAgentId,
} from "../../../terminal-agents";
import { protectedProcedure, router } from "../../index";

type GetOrCreateResult = {
	binding: TerminalAgentBinding;
	created: boolean;
};

const inflight = new Map<string, Promise<GetOrCreateResult>>();

function inflightKey(
	workspaceId: string,
	agentId: TerminalAgentId,
	definitionId: AgentDefinitionId | undefined,
): string {
	return `${workspaceId}::${agentId}::${definitionId ?? ""}`;
}

const terminalAgentIdSchema = z.enum(BUILTIN_AGENT_IDS);
const agentDefinitionIdSchema = z.union([
	z.enum(BUILTIN_AGENT_IDS),
	z.string().regex(/^custom:.+$/, "must be a builtin id or `custom:<name>`"),
]) as z.ZodType<AgentDefinitionId>;

const GET_OR_CREATE_TIMEOUT_MS = 10_000;

export const terminalAgentsRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		return ctx.terminalAgentStore.list();
	}),

	listByWorkspace: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				agentId: terminalAgentIdSchema.optional(),
				definitionId: agentDefinitionIdSchema.optional(),
			}),
		)
		.query(({ ctx, input }) => {
			const { workspaceId, agentId, definitionId } = input;
			return ctx.terminalAgentStore.listByWorkspace(workspaceId, {
				...(agentId ? { agentId } : {}),
				...(definitionId ? { definitionId } : {}),
			});
		}),

	findActive: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				agentId: terminalAgentIdSchema,
				definitionId: agentDefinitionIdSchema.optional(),
			}),
		)
		.query(({ ctx, input }) => {
			return (
				ctx.terminalAgentStore.findActive(
					input.workspaceId,
					input.agentId,
					input.definitionId,
				) ?? null
			);
		}),

	/**
	 * Status-clearing escape hatch: force the workspace's bindings (or just
	 * `terminalId`'s) to `Stop` so a wedged working/permission indicator
	 * resets. Used by sidebar "Clear Status" and the pane interrupt handler
	 * (agents fire no hook on Esc/Ctrl+C). Deliberately not a hook event —
	 * it must not broadcast a completion chime/notification. Safe on live
	 * agents: their next hook event re-asserts the real state.
	 */
	clearWorkspaceStatuses: protectedProcedure
		.input(
			z.object({ workspaceId: z.string(), terminalId: z.string().optional() }),
		)
		.mutation(({ ctx, input }) => {
			ctx.terminalAgentStore.clearWorkspaceStatuses(
				input.workspaceId,
				input.terminalId,
			);
			return { success: true };
		}),

	/**
	 * Reuse-or-launch primitive. Returns an existing active binding for the
	 * `(workspaceId, agentId, definitionId)` triple, or spawns a fresh
	 * terminal and waits up to 10s for the agent's hook to register.
	 *
	 * Resolves on the first lifecycle hook — not on REPL prompt-readiness.
	 * Callers that need to `terminal.writeInput` immediately should add
	 * their own readiness wait. Input formatting also lives in the caller.
	 */
	getOrCreate: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				agentId: terminalAgentIdSchema,
				definitionId: agentDefinitionIdSchema.optional(),
				initialCommand: z.string().trim().min(1).optional(),
				cwd: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, agentId, definitionId } = input;
			const existing = ctx.terminalAgentStore.findActive(
				workspaceId,
				agentId,
				definitionId,
			);
			if (existing) {
				return { binding: existing, created: false };
			}

			// Coalesce concurrent callers so the same triple doesn't spawn twice.
			const key = inflightKey(workspaceId, agentId, definitionId);
			const pending = inflight.get(key);
			if (pending) return pending;

			const promise = (async (): Promise<GetOrCreateResult> => {
				const terminalId = crypto.randomUUID();
				const created = await createTerminalSessionInternal({
					terminalId,
					workspaceId,
					db: ctx.db,
					eventBus: ctx.eventBus,
					...(input.initialCommand
						? { initialCommand: input.initialCommand }
						: {}),
					...(input.cwd ? { cwd: input.cwd } : {}),
				});

				if ("error" in created) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: created.error,
					});
				}

				try {
					const binding = await waitForBinding({
						store: ctx.terminalAgentStore,
						workspaceId,
						agentId,
						definitionId,
						terminalId: created.terminalId,
						timeoutMs: GET_OR_CREATE_TIMEOUT_MS,
					});
					return { binding, created: true };
				} catch (err) {
					// Hook never landed — tear down the orphaned pty so retries
					// don't pile up zombies.
					await disposeSessionAndWait(created.terminalId, ctx.db).catch(
						(cleanupError) => {
							console.warn(
								"[terminal-agents] failed to dispose timed-out terminal",
								{ terminalId: created.terminalId, cleanupError },
							);
						},
					);
					throw err;
				}
			})();

			inflight.set(key, promise);
			try {
				return await promise;
			} finally {
				inflight.delete(key);
			}
		}),
});

interface WaitForBindingArgs {
	store: import("../../../terminal-agents").TerminalAgentStore;
	workspaceId: string;
	agentId: TerminalAgentId;
	definitionId?: AgentDefinitionId;
	terminalId: string;
	timeoutMs: number;
}

function waitForBinding({
	store,
	workspaceId,
	agentId,
	definitionId,
	terminalId,
	timeoutMs,
}: WaitForBindingArgs): Promise<TerminalAgentBinding> {
	return new Promise((resolve, reject) => {
		const match = (): TerminalAgentBinding | undefined => {
			const binding = store.get(terminalId);
			if (!binding) return undefined;
			if (binding.workspaceId !== workspaceId) return undefined;
			if (binding.agentId !== agentId) return undefined;
			if (definitionId !== undefined && binding.definitionId !== definitionId)
				return undefined;
			return binding;
		};

		const immediate = match();
		if (immediate) {
			resolve(immediate);
			return;
		}

		const onChange = () => {
			const hit = match();
			if (!hit) return;
			cleanup();
			resolve(hit);
		};
		const cleanup = () => {
			clearTimeout(timer);
			store.off("change", onChange);
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(
				new TRPCError({
					code: "TIMEOUT",
					message: `Timed out after ${timeoutMs}ms waiting for ${agentId} to attach to ${terminalId}`,
				}),
			);
		}, timeoutMs);

		store.on("change", onChange);
	});
}
