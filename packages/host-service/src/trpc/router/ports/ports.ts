import {
	buildPortEnrichment,
	type DetectedPort,
	type PortScheme,
} from "@superset/port-scanner";
import { z } from "zod";
import { portManager } from "../../../ports/port-manager";
import { getStaticPortsForWorkspace } from "../../../ports/static-ports";
import { protectedProcedure, router } from "../../index";

export interface EnrichedPort extends DetectedPort {
	label: string | null;
	/** Scheme from `.superset/ports.json`; null when the port isn't declared there. */
	scheme: PortScheme | null;
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
					// Workspace deleted or unknown — no entries for this row.
					return null;
				}
			};
			const entriesByWorkspace = new Map<
				string,
				ReturnType<typeof getStaticPortsForWorkspace>
			>();
			return portManager
				.getAllPorts()
				.filter((port) => requestedWorkspaceIds.has(port.workspaceId))
				.map((port) => {
					let entries = entriesByWorkspace.get(port.workspaceId);
					if (!entriesByWorkspace.has(port.workspaceId)) {
						entries = getStaticPortsForWorkspace(resolve, port.workspaceId);
						entriesByWorkspace.set(port.workspaceId, entries);
					}
					return { ...port, ...buildPortEnrichment(entries?.get(port.port)) };
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
