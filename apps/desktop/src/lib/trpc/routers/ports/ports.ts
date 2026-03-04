import { workspaces } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { loadStaticPorts } from "main/lib/static-ports";
import { portManager } from "main/lib/terminal/port-manager";
import type { DetectedPort, EnrichedPort } from "shared/types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspacePath } from "../workspaces/utils/worktree";

type PortEvent =
	| { type: "add"; port: DetectedPort }
	| { type: "remove"; port: DetectedPort };

function getLabelsForPath(worktreePath: string): Map<number, string> | null {
	const result = loadStaticPorts(worktreePath);
	if (!result.exists || result.error || !result.ports) return null;

	const labels = new Map<number, string>();
	for (const p of result.ports) {
		labels.set(p.port, p.label);
	}
	return labels;
}

export const createPortsRouter = () => {
	return router({
		getAll: publicProcedure.query((): EnrichedPort[] => {
			const detectedPorts = portManager.getAllPorts();

			const labelCache = new Map<string, Map<number, string> | null>();

			return detectedPorts.map((port) => {
				if (!labelCache.has(port.workspaceId)) {
					const ws = localDb
						.select()
						.from(workspaces)
						.where(eq(workspaces.id, port.workspaceId))
						.get();
					const wsPath = ws ? getWorkspacePath(ws) : null;
					labelCache.set(
						port.workspaceId,
						wsPath ? getLabelsForPath(wsPath) : null,
					);
				}

				const labels = labelCache.get(port.workspaceId);
				return { ...port, label: labels?.get(port.port) ?? null };
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
};
