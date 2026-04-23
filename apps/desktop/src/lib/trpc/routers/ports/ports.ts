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

/**
 * Resolve `ports.json` labels per workspace on demand, then memoize.
 *
 * Why memoize: `getAll` runs on every `port:add`/`port:remove` event (the
 * renderer calls `utils.ports.getAll.invalidate()` in usePortsData). A dev
 * server that flaps 5 ports cascades into 5 `getAll` calls × N workspaces of
 * sync SQLite reads on the main thread. Cache once; ports.json rarely changes.
 *
 * A resolved entry of `null` means "no labels file" — still cached so we don't
 * re-check the filesystem every event.
 */
const labelCache = new Map<string, Map<number, string> | null>();

function getLabelsForWorkspace(
	workspaceId: string,
): Map<number, string> | null {
	if (labelCache.has(workspaceId)) {
		return labelCache.get(workspaceId) ?? null;
	}

	const ws = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	const worktreePath = ws ? getWorkspacePath(ws) : null;
	if (!worktreePath) {
		labelCache.set(workspaceId, null);
		return null;
	}

	const result = loadStaticPorts(worktreePath);
	if (!result.exists || result.error || !result.ports) {
		labelCache.set(workspaceId, null);
		return null;
	}

	const labels = new Map<number, string>();
	for (const p of result.ports) {
		labels.set(p.port, p.label);
	}
	labelCache.set(workspaceId, labels);
	return labels;
}

/**
 * Invalidate the label cache. Call when a workspace is deleted or its
 * `ports.json` is edited — otherwise stale labels linger until app restart.
 */
export function invalidatePortLabelCache(workspaceId?: string): void {
	if (workspaceId === undefined) {
		labelCache.clear();
	} else {
		labelCache.delete(workspaceId);
	}
}

export const createPortsRouter = () => {
	return router({
		getAll: publicProcedure.query((): EnrichedPort[] => {
			const detectedPorts = portManager.getAllPorts();
			return detectedPorts.map((port) => {
				const labels = getLabelsForWorkspace(port.workspaceId);
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
