import { observable } from "@trpc/server/observable";
import { portManager } from "main/lib/terminal/port-manager";
import type { DetectedPort, EnrichedPort } from "shared/types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getLabelsForWorkspace } from "./label-cache";

export { invalidatePortLabelCache } from "./label-cache";

type PortEvent =
	| { type: "add"; port: DetectedPort }
	| { type: "remove"; port: DetectedPort };

export const createPortsRouter = () => {
	return router({
		getAll: publicProcedure.query((): EnrichedPort[] => {
			const detectedPorts = portManager.getAllPorts();
			return detectedPorts.map((port) => {
				const labels = getLabelsForWorkspace(port.workspaceId);
				return {
					...port,
					label: labels?.get(port.port) ?? null,
					hostUrl: null,
				};
			});
		}),

		subscribe: publicProcedure.subscription(() => {
			return observable<PortEvent>((emit) => {
				const onAdd = (port: DetectedPort) => {
					emit.next({ type: "add", port });
				};

				const onRemove = (port: DetectedPort) => {
					emit.next({ type: "remove", port });
				};

				portManager.on("port:add", onAdd);
				portManager.on("port:remove", onRemove);

				return () => {
					portManager.off("port:add", onAdd);
					portManager.off("port:remove", onRemove);
				};
			});
		}),

		kill: publicProcedure
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
};
