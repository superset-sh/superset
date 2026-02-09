import path from "node:path";
import { workspaces } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { fsWatcher } from "main/lib/fs-watcher";
import { localDb } from "main/lib/local-db";
import { hasStaticPortsConfig, loadStaticPorts } from "main/lib/static-ports";
import { portManager } from "main/lib/terminal/port-manager";
import { PORTS_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import type { FileSystemBatchEvent } from "shared/file-tree-types";
import type { DetectedPort, StaticPort } from "shared/types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspacePath } from "../workspaces/utils/worktree";

type PortEvent =
	| { type: "add"; port: DetectedPort }
	| { type: "remove"; port: DetectedPort };

export const createPortsRouter = () => {
	return router({
		getAll: publicProcedure.query(() => {
			return portManager.getAllPorts();
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

		hasStaticConfig: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }): { hasStatic: boolean } => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();

				if (!workspace) {
					return { hasStatic: false };
				}

				const workspacePath = getWorkspacePath(workspace);
				if (!workspacePath) {
					return { hasStatic: false };
				}

				return { hasStatic: hasStaticPortsConfig(workspacePath) };
			}),

		getStatic: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(
				({ input }): { ports: StaticPort[] | null; error: string | null } => {
					const workspace = localDb
						.select()
						.from(workspaces)
						.where(eq(workspaces.id, input.workspaceId))
						.get();

					if (!workspace) {
						return { ports: null, error: "Workspace not found" };
					}

					const workspacePath = getWorkspacePath(workspace);
					if (!workspacePath) {
						return { ports: null, error: "Workspace path not found" };
					}

					const result = loadStaticPorts(workspacePath);

					if (!result.exists) {
						return { ports: null, error: null };
					}

					if (result.error) {
						return { ports: null, error: result.error };
					}

					const portsWithWorkspace: StaticPort[] =
						result.ports?.map((p) => ({
							...p,
							workspaceId: input.workspaceId,
						})) ?? [];

					return { ports: portsWithWorkspace, error: null };
				},
			),

		getAllStatic: publicProcedure.query(
			(): {
				ports: StaticPort[];
				errors: Array<{ workspaceId: string; error: string }>;
			} => {
				const allWorkspaces = localDb.select().from(workspaces).all();
				const allPorts: StaticPort[] = [];
				const errors: Array<{ workspaceId: string; error: string }> = [];

				for (const workspace of allWorkspaces) {
					const workspacePath = getWorkspacePath(workspace);
					if (!workspacePath) continue;

					const result = loadStaticPorts(workspacePath);

					if (!result.exists) continue;

					if (result.error) {
						errors.push({ workspaceId: workspace.id, error: result.error });
						continue;
					}

					if (result.ports) {
						const portsWithWorkspace = result.ports.map((p) => ({
							...p,
							workspaceId: workspace.id,
						}));
						allPorts.push(...portsWithWorkspace);
					}
				}

				return { ports: allPorts, errors };
			},
		),

		subscribeStatic: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.subscription(({ input }) => {
				const portsRelativePath = path.join(
					PROJECT_SUPERSET_DIR_NAME,
					PORTS_FILE_NAME,
				);

				return observable<{ type: "change" }>((emit) => {
					const onBatch = (batch: FileSystemBatchEvent) => {
						if (batch.workspaceId !== input.workspaceId) return;

						const hasPortsChange = batch.events.some(
							(e) =>
								e.relativePath === portsRelativePath ||
								e.relativePath === PROJECT_SUPERSET_DIR_NAME,
						);
						if (hasPortsChange) {
							emit.next({ type: "change" });
						}
					};

					fsWatcher.on("batch", onBatch);

					return () => {
						fsWatcher.off("batch", onBatch);
					};
				});
			}),
	});
};
