import type { DetectedPort } from "@superset/port-scanner";
import { z } from "zod";
import { portManager } from "../../../ports/port-manager";
import { protectedProcedure, router } from "../../index";

export type PortEvent =
	| { type: "add"; port: DetectedPort }
	| { type: "remove"; port: DetectedPort };

export const portsRouter = router({
	getAll: protectedProcedure.query((): DetectedPort[] => {
		return portManager.getAllPorts();
	}),

	/**
	 * Stream port add/remove events. tRPC v11 async iterators: the generator
	 * runs until the client disconnects (or an abort signal cancels it), at
	 * which point the `finally` block detaches emitter listeners.
	 */
	subscribe: protectedProcedure.subscription(async function* ({ signal }) {
		const queue: PortEvent[] = [];
		let resolve: (() => void) | null = null;
		const wake = () => {
			resolve?.();
			resolve = null;
		};

		const onAdd = (port: DetectedPort) => {
			queue.push({ type: "add", port });
			wake();
		};
		const onRemove = (port: DetectedPort) => {
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
					resolve = r;
				});
			}
		} finally {
			portManager.off("port:add", onAdd);
			portManager.off("port:remove", onRemove);
		}
	}),

	kill: protectedProcedure
		.input(
			z.object({
				paneId: z.string(),
				port: z.number().int().positive(),
			}),
		)
		.mutation(
			async ({ input }): Promise<{ success: boolean; error?: string }> => {
				return portManager.killPort(input);
			},
		),
});
