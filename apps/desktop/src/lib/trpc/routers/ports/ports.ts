import { workspaces } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { loadStaticPorts, runPortCheckScript } from "main/lib/static-ports";
import { portManager } from "main/lib/terminal/port-manager";
import type { DetectedPort, EnrichedPort, ScriptPort } from "shared/types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspacePath } from "../workspaces/utils/worktree";

type PortEvent =
	| { type: "add"; port: DetectedPort }
	| { type: "remove"; port: DetectedPort };

interface StaticPortMetadata {
	labels: Map<number, string>;
	urls: Map<number, string>;
	check: string | null;
}

function getStaticMetadataForPath(
	worktreePath: string,
): StaticPortMetadata | null {
	const result = loadStaticPorts(worktreePath);
	if (!result.exists || result.error || !result.ports) {
		// Still return check command even if ports array is empty/missing
		if (result.check) {
			return {
				labels: new Map(),
				urls: new Map(),
				check: result.check,
			};
		}
		return null;
	}

	const labels = new Map<number, string>();
	const urls = new Map<number, string>();
	for (const p of result.ports) {
		labels.set(p.port, p.label);
		if (p.url) {
			urls.set(p.port, p.url);
		}
	}
	return { labels, urls, check: result.check };
}

function applyScriptPortsToMetadata(
	scriptPorts: ScriptPort[],
	metadata: StaticPortMetadata,
): void {
	for (const sp of scriptPorts) {
		if (sp.name && !metadata.labels.has(sp.port)) {
			metadata.labels.set(sp.port, sp.name);
		}
		if (sp.url && !metadata.urls.has(sp.port)) {
			metadata.urls.set(sp.port, sp.url);
		}
	}
}

function scriptPortToEnrichedPort(
	sp: ScriptPort,
	workspaceId: string,
	metadata: StaticPortMetadata,
): EnrichedPort {
	return {
		port: sp.port,
		pid: sp.pid ?? 0,
		processName: sp.name ?? "unknown",
		paneId: "",
		workspaceId,
		detectedAt: Date.now(),
		address: "0.0.0.0",
		label: metadata.labels.get(sp.port) ?? sp.name ?? null,
		url: metadata.urls.get(sp.port) ?? sp.url ?? null,
	};
}

interface WorkspaceContext {
	metadata: StaticPortMetadata | null;
	wsPath: string | null;
	scriptPorts: ScriptPort[];
}

function getWorkspaceContext(workspaceId: string): WorkspaceContext {
	const ws = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	const wsPath = ws ? getWorkspacePath(ws) : null;
	const metadata = wsPath ? getStaticMetadataForPath(wsPath) : null;
	return { metadata, wsPath, scriptPorts: [] };
}

export const createPortsRouter = () => {
	return router({
		getAll: publicProcedure.query(async (): Promise<EnrichedPort[]> => {
			const detectedPorts = portManager.getAllPorts();

			const contextCache = new Map<string, WorkspaceContext>();

			// Collect workspace contexts for detected ports
			for (const port of detectedPorts) {
				if (!contextCache.has(port.workspaceId)) {
					contextCache.set(
						port.workspaceId,
						getWorkspaceContext(port.workspaceId),
					);
				}
			}

			// Also check ALL workspaces for check scripts (ports may not be
			// detected via PID-tree, e.g. when running inside Zellij/tmux/Docker)
			const allWorkspaces = localDb.select().from(workspaces).all();
			for (const ws of allWorkspaces) {
				if (contextCache.has(ws.id)) continue;
				const wsPath = getWorkspacePath(ws);
				if (!wsPath) continue;
				const metadata = getStaticMetadataForPath(wsPath);
				if (metadata?.check) {
					contextCache.set(ws.id, {
						metadata,
						wsPath,
						scriptPorts: [],
					});
				}
			}

			// Run check scripts in parallel
			const scriptTasks: Promise<void>[] = [];
			for (const [, ctx] of contextCache) {
				if (ctx.metadata?.check && ctx.wsPath) {
					const { check } = ctx.metadata;
					const { wsPath } = ctx;
					scriptTasks.push(
						runPortCheckScript(check, wsPath).then((scriptPorts) => {
							ctx.scriptPorts = scriptPorts;
							if (ctx.metadata) {
								applyScriptPortsToMetadata(scriptPorts, ctx.metadata);
							}
						}),
					);
				}
			}
			await Promise.all(scriptTasks);

			// Build enriched ports from detected ports
			const detectedPortKeys = new Set<string>();
			const enrichedPorts: EnrichedPort[] = detectedPorts.map((port) => {
				detectedPortKeys.add(`${port.workspaceId}:${port.port}`);
				const ctx = contextCache.get(port.workspaceId);
				const metadata = ctx?.metadata;
				return {
					...port,
					label: metadata?.labels.get(port.port) ?? null,
					url: metadata?.urls.get(port.port) ?? null,
				};
			});

			// Add script-only ports (not already detected by PID-tree scanner)
			for (const [workspaceId, ctx] of contextCache) {
				for (const sp of ctx.scriptPorts) {
					const key = `${workspaceId}:${sp.port}`;
					if (detectedPortKeys.has(key)) continue;
					detectedPortKeys.add(key);
					enrichedPorts.push(
						scriptPortToEnrichedPort(
							sp,
							workspaceId,
							ctx.metadata ?? { labels: new Map(), urls: new Map(), check: null },
						),
					);
				}
			}

			return enrichedPorts;
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
