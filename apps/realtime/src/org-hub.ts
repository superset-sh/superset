import type {
	RealtimeNudgeKind,
	RealtimeNudgeMessage,
	RealtimeUpdate,
} from "@superset/shared/realtime";
import { Server } from "partyserver";
import type { RealtimeEnv } from "./types";

// A burst of writes is one message: kinds accumulate for this long, then one
// broadcast carries all of them.
const COALESCE_MS = 500;
const PENDING_KEY = "pendingKinds";
const PENDING_UPDATES_KEY = "pendingUpdates";

/**
 * One object per organization. Holds every subscribed window's socket
 * (hibernating, so idle subscribers cost nothing) and fans out invalidation
 * nudges the API sends after its writes. It stores nothing but what is
 * waiting on the next broadcast; the data itself stays in Postgres.
 */
export class OrgHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	// ── RPC (called by the Worker) ────────────────────────────────────

	async nudge(kind: RealtimeNudgeKind, update?: RealtimeUpdate): Promise<void> {
		if (update) {
			const updates =
				(await this.ctx.storage.get<Record<string, RealtimeUpdate>>(
					PENDING_UPDATES_KEY,
				)) ?? {};
			updates[update.workspaceId] = update;
			await this.ctx.storage.put(PENDING_UPDATES_KEY, updates);
		} else {
			const pending =
				(await this.ctx.storage.get<RealtimeNudgeKind[]>(PENDING_KEY)) ?? [];
			if (!pending.includes(kind)) {
				await this.ctx.storage.put(PENDING_KEY, [...pending, kind]);
			}
		}
		if ((await this.ctx.storage.getAlarm()) === null) {
			await this.ctx.storage.setAlarm(Date.now() + COALESCE_MS);
		}
	}

	async subscriberCount(): Promise<number> {
		let count = 0;
		for (const _ of this.getConnections()) count++;
		return count;
	}

	// ── Fan-out ───────────────────────────────────────────────────────

	async onAlarm(): Promise<void> {
		const kinds =
			(await this.ctx.storage.get<RealtimeNudgeKind[]>(PENDING_KEY)) ?? [];
		const updates = Object.values(
			(await this.ctx.storage.get<Record<string, RealtimeUpdate>>(
				PENDING_UPDATES_KEY,
			)) ?? {},
		);
		await this.ctx.storage.delete([PENDING_KEY, PENDING_UPDATES_KEY]);
		if (kinds.length === 0 && updates.length === 0) return;
		const message: RealtimeNudgeMessage = { type: "nudge", kinds, updates };
		this.broadcast(JSON.stringify(message));
	}
}
