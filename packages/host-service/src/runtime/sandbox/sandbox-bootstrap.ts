import type { HostDb } from "../../db/index.ts";
import type { EventBus } from "../../events/index.ts";
import { notifyWorkspaceUpdated } from "../../workspaces/local-workspace-store.ts";
import { markSandboxProvisioning } from "./container-manager.ts";
import { getWorkspaceRuntime } from "./registry.ts";

/**
 * Eagerly provision a sandboxed workspace's container at CREATE time instead
 * of waiting for the first terminal. Fire-and-forget: the create mutation
 * stays fast, the first PTY joins the single-flight ensure already running,
 * and snapshot events keep the renderer's "Initializing sandbox…" step live.
 *
 * Failures are logged, not thrown — the first terminal repeats the ensure
 * and surfaces the actionable error in the terminal UI.
 */
export function bootstrapWorkspaceSandbox(
	ctx: { db: HostDb; eventBus: EventBus },
	workspaceId: string,
): void {
	const runtime = getWorkspaceRuntime(ctx.db, workspaceId);
	if (runtime.kind !== "docker") return;

	markSandboxProvisioning(workspaceId);
	notifyWorkspaceUpdated(ctx, workspaceId);

	void runtime
		.prepare()
		.catch((error) => {
			console.warn(
				`[sandbox] eager bootstrap failed for workspace ${workspaceId}:`,
				error instanceof Error ? error.message : error,
			);
		})
		.finally(() => {
			notifyWorkspaceUpdated(ctx, workspaceId);
		});
}
