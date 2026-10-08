import { eq } from "drizzle-orm";
import { workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";

const NO_DEVICES_BACKOFF_MS = 10 * 60_000;
const PREVIEW_MAX_LENGTH = 4000;

const noDevicesUntil = new WeakMap<HostServiceContext, number>();

export function notifyPhones(
	ctx: HostServiceContext,
	event: {
		workspaceId: string;
		terminalId: string;
		eventType: "Stop" | "PermissionRequest";
		preview?: string;
		occurredAt: number;
	},
): void {
	if ((noDevicesUntil.get(ctx) ?? 0) > event.occurredAt) return;

	const workspace = ctx.db.query.workspaces
		.findFirst({
			where: eq(workspaces.id, event.workspaceId),
			columns: { name: true },
		})
		.sync();
	void ctx.api.push.notifyAgentEvent
		.mutate({
			event: event.eventType === "Stop" ? "stop" : "permission",
			workspaceId: event.workspaceId,
			terminalId: event.terminalId,
			workspaceName: workspace?.name || undefined,
			preview: event.preview?.slice(0, PREVIEW_MAX_LENGTH),
		})
		.then(({ sent }) => {
			if (sent === 0) {
				noDevicesUntil.set(ctx, event.occurredAt + NO_DEVICES_BACKOFF_MS);
			}
		})
		.catch((err) => {
			console.warn(
				`[agent-lifecycle] failed to notify phones for workspace ${event.workspaceId}:`,
				err,
			);
		});
}
