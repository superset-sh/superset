import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type {
	TerminalAgentBinding,
	TerminalAgentId,
} from "../../../terminal-agents";
import { protectedProcedure, router } from "../../index";

const terminalAgentIdSchema = z.string().min(1) as z.ZodType<TerminalAgentId>;
const agentDefinitionIdSchema = z
	.string()
	.min(1) as z.ZodType<AgentDefinitionId>;

const GET_OR_CREATE_TIMEOUT_MS = 10_000;

export const terminalAgentsRouter = router({
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
	 * Reuse-or-launch primitive. Returns an existing active binding for the
	 * `(workspaceId, agentId, definitionId)` triple if one exists; otherwise
	 * spawns a fresh terminal with `initialCommand`/`cwd` and waits for the
	 * agent's hook to register a binding (10s budget).
	 *
	 * Callers compose with `terminal.writeInput` after this resolves — this
	 * module does not format input.
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
				return { binding: existing, created: false as const };
			}

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

			const binding = await waitForBinding({
				store: ctx.terminalAgentStore,
				workspaceId,
				agentId,
				definitionId,
				terminalId: created.terminalId,
				timeoutMs: GET_OR_CREATE_TIMEOUT_MS,
			});

			return { binding, created: true as const };
		}),

	/**
	 * Snapshot-then-deltas stream of bindings for a workspace. Emits a
	 * snapshot on subscribe and after every store mutation. Renderer
	 * clients can drop their own diffing — re-render from the latest array.
	 *
	 * Uses `observable` rather than an async generator (required by
	 * `trpc-electron`; harmless for HTTP/SSE transports).
	 */
	onWorkspaceChange: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.subscription(({ ctx, input }) => {
			return observable<{
				kind: "snapshot" | "change";
				bindings: TerminalAgentBinding[];
			}>((emit) => {
				const snapshot = () => ({
					bindings: ctx.terminalAgentStore.listByWorkspace(input.workspaceId),
				});
				emit.next({ kind: "snapshot", ...snapshot() });

				const handler = (workspaceId: string) => {
					if (workspaceId !== input.workspaceId) return;
					emit.next({ kind: "change", ...snapshot() });
				};
				ctx.terminalAgentStore.on("change", handler);
				return () => {
					ctx.terminalAgentStore.off("change", handler);
				};
			});
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
