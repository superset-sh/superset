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

interface StaticPortInfo {
	port: number;
	label: string;
	host?: string;
}

function getStaticPortsForPath(worktreePath: string): StaticPortInfo[] | null {
	const result = loadStaticPorts(worktreePath);
	if (!result.exists || result.error || !result.ports) return null;
	return result.ports;
}

export const createPortsRouter = () => {
	return router({
		getAll: publicProcedure.query((): EnrichedPort[] => {
			const detectedPorts = portManager.getAllPorts();

			const staticCache = new Map<string, StaticPortInfo[] | null>();
			const enriched: EnrichedPort[] = [];

			for (const port of detectedPorts) {
				if (!staticCache.has(port.workspaceId)) {
					const ws = localDb
						.select()
						.from(workspaces)
						.where(eq(workspaces.id, port.workspaceId))
						.get();
					const wsPath = ws ? getWorkspacePath(ws) : null;
					staticCache.set(
						port.workspaceId,
						wsPath ? getStaticPortsForPath(wsPath) : null,
					);
				}

				const staticPorts = staticCache.get(port.workspaceId);
				const matches =
					staticPorts?.filter((sp) => sp.port === port.port) ?? [];

				if (matches.length === 0) {
					enriched.push({ ...port, label: null, host: null });
				} else {
					for (const match of matches) {
						enriched.push({
							...port,
							label: match.label,
							host: match.host ?? null,
						});
					}
				}
			}

			return enriched;
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
