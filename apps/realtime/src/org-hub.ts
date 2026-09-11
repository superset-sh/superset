import type {
	RealtimeNudgeKind,
	RealtimeNudgeMessage,
} from "@superset/shared/realtime";
import { Server } from "partyserver";
import type { RealtimeEnv } from "./types";

// A webhook storm is one message: kinds accumulate for this long, then one
// broadcast carries all of them.
const COALESCE_MS = 500;
const PENDING_KEY = "pendingKinds";

/**
 * One object per organization. Holds every subscribed window's socket
 * (hibernating, so idle subscribers cost nothing) and fans out invalidation
 * nudges the API sends after its writes. It stores nothing but the kinds
 * waiting on the next broadcast; the data itself stays in Postgres.
 */
export class OrgHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	// ── RPC (called by the Worker) ────────────────────────────────────

	async nudge(kind: RealtimeNudgeKind): Promise<void> {
		const pending =
			(await this.ctx.storage.get<RealtimeNudgeKind[]>(PENDING_KEY)) ?? [];
		if (!pending.includes(kind)) {
			await this.ctx.storage.put(PENDING_KEY, [...pending, kind]);
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
		await this.ctx.storage.delete(PENDING_KEY);
		if (kinds.length === 0) return;
		const message: RealtimeNudgeMessage = { type: "nudge", kinds };
		this.broadcast(JSON.stringify(message));
	}
}
