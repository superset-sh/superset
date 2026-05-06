import type { DetectedPort } from "@superset/port-scanner";
import { z } from "zod";
import { portManager } from "../../../ports/port-manager";
import { getLabelsForWorkspace } from "../../../ports/static-ports";
import { protectedProcedure, router } from "../../index";

export interface EnrichedPort extends DetectedPort {
	label: string | null;
}

export type PortEvent =
	| { type: "add"; port: DetectedPort }
	| { type: "remove"; port: DetectedPort };

const getAllInputSchema = z.object({
	workspaceIds: z.array(z.string()).min(1),
});

export const portsRouter = router({
	getAll: protectedProcedure
		.input(getAllInputSchema)
		.query(({ ctx, input }): EnrichedPort[] => {
			const requestedWorkspaceIds = new Set(input.workspaceIds);
			const resolve = (workspaceId: string): string | null => {
				try {
					return ctx.runtime.filesystem.resolveWorkspaceRoot(workspaceId);
				} catch {
					// Workspace deleted or unknown — no labels for this row.
					return null;
				}
			};
			const labelsByWorkspace = new Map<
				string,
				ReturnType<typeof getLabelsForWorkspace>
			>();
			return portManager
				.getAllPorts()
				.filter((port) => requestedWorkspaceIds.has(port.workspaceId))
				.map((port) => {
					let labels = labelsByWorkspace.get(port.workspaceId);
					if (!labelsByWorkspace.has(port.workspaceId)) {
						labels = getLabelsForWorkspace(resolve, port.workspaceId);
						labelsByWorkspace.set(port.workspaceId, labels);
					}
					return { ...port, label: labels?.get(port.port) ?? null };
				});
		}),

	/**
	 * Stream port add/remove events. tRPC v11 async iterators: the generator
	 * runs until the client disconnects (or an abort signal cancels it), at
	 * which point the `finally` block detaches emitter listeners.
	 */
	subscribe: protectedProcedure
		.input(getAllInputSchema)
		.subscription(async function* ({ signal, input }) {
			const requestedWorkspaceIds = new Set(input.workspaceIds);
			const queue: PortEvent[] = [];
			let resolve: (() => void) | null = null;
			const wake = () => {
				resolve?.();
				resolve = null;
			};

			const onAdd = (port: DetectedPort) => {
				if (!requestedWorkspaceIds.has(port.workspaceId)) return;
				queue.push({ type: "add", port });
				wake();
			};
			const onRemove = (port: DetectedPort) => {
				if (!requestedWorkspaceIds.has(port.workspaceId)) return;
				queue.push({ type: "remove", port });
				wake();
			};

			portManager.on("port:add", onAdd);
			portManager.on("port:remove", onRemove);

			signal?.addEventListener("abort", wake);

			try {
				while (!signal?.aborted) {
					while (queue.length > 0) {
						const event = queue.shift();
						if (event) yield event;
					}
					await new Promise<void>((r) => {
						if (signal?.aborted) {
							r();
							return;
						}
						resolve = r;
					});
				}
			} finally {
				portManager.off("port:add", onAdd);
				portManager.off("port:remove", onRemove);
				signal?.removeEventListener("abort", wake);
			}
		}),

	kill: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				terminalId: z.string(),
				port: z.number().int().positive(),
			}),
		)
		.mutation(
			async ({ input }): Promise<{ success: boolean; error?: string }> => {
				return portManager.killPort(input);
			},
		),
});
