import type { NodeWebSocket } from "@hono/node-ws";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import type { Hono } from "hono";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";

export interface WorkspaceFilesystemEventsMessage {
	type: "events";
	events: FsWatchEvent[];
}

export interface WorkspaceFilesystemErrorMessage {
	type: "error";
	message: string;
}

export type WorkspaceFilesystemServerMessage =
	| WorkspaceFilesystemEventsMessage
	| WorkspaceFilesystemErrorMessage;

export function buildWorkspaceFilesystemEventsPath(
	workspaceId: string,
): string {
	return `/workspace-filesystem/${encodeURIComponent(workspaceId)}/events`;
}

interface RegisterWorkspaceFilesystemEventsRouteOptions {
	app: Hono;
	filesystem: WorkspaceFilesystemManager;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

function sendMessage(
	socket: {
		send: (data: string) => void;
		readyState: number;
		close: (code?: number, reason?: string) => void;
	},
	message: WorkspaceFilesystemServerMessage,
): void {
	if (socket.readyState !== 1) {
		return;
	}

	socket.send(JSON.stringify(message));
}

export function registerWorkspaceFilesystemEventsRoute({
	app,
	filesystem,
	upgradeWebSocket,
}: RegisterWorkspaceFilesystemEventsRouteOptions) {
	app.get(
		"/workspace-filesystem/:workspaceId/events",
		upgradeWebSocket((c) => {
			const workspaceId = c.req.param("workspaceId");
			let disposed = false;
			let iterator: AsyncIterator<{ events: FsWatchEvent[] }> | null = null;

			const disposeIterator = () => {
				if (disposed) {
					return;
				}

				disposed = true;
				const currentIterator = iterator;
				iterator = null;
				void currentIterator?.return?.().catch((error: unknown) => {
					console.error(
						"[host-service/workspace-filesystem-events] Cleanup failed:",
						{
							workspaceId,
							error,
						},
					);
				});
			};

			return {
				onOpen: (_event, ws) => {
					if (!workspaceId) {
						sendMessage(ws, {
							type: "error",
							message: "Workspace not found",
						});
						ws.close(1008, "Workspace not found");
						return;
					}

					let rootPath: string;
					try {
						rootPath = filesystem.resolveWorkspaceRoot(workspaceId);
					} catch (error) {
						sendMessage(ws, {
							type: "error",
							message:
								error instanceof Error ? error.message : "Workspace not found",
						});
						ws.close(1011, "Workspace not found");
						return;
					}

					try {
						const service = filesystem.getServiceForWorkspace(workspaceId);
						iterator = service
							.watchPath({
								absolutePath: rootPath,
								recursive: true,
							})
							[Symbol.asyncIterator]();
					} catch (error) {
						sendMessage(ws, {
							type: "error",
							message:
								error instanceof Error
									? error.message
									: "Failed to start filesystem watcher",
						});
						ws.close(1011, "Failed to start filesystem watcher");
						return;
					}

					void (async () => {
						try {
							while (!disposed && iterator) {
								const next = await iterator.next();
								if (disposed || next.done) {
									return;
								}

								sendMessage(ws, {
									type: "events",
									events: next.value.events,
								});
							}
						} catch (error) {
							console.error(
								"[host-service/workspace-filesystem-events] Stream failed:",
								{
									workspaceId,
									error,
								},
							);

							sendMessage(ws, {
								type: "error",
								message:
									error instanceof Error
										? error.message
										: "Filesystem event stream failed",
							});
							ws.close(1011, "Filesystem event stream failed");
						}
					})();
				},
				onClose: () => {
					disposeIterator();
				},
				onError: () => {
					disposeIterator();
				},
			};
		}),
	);
}
