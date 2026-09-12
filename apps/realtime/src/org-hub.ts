import type {
	RealtimeNudgeKind,
	RealtimeNudgeMessage,
} from "@superset/shared/realtime";
import { Server } from "partyserver";
import type { RealtimeEnv } from "./types";

// How long a kind accumulates before one broadcast carries it. Pull requests
// wait longer: a busy organization's CI writes them every few hundred
// milliseconds all day, and at 500ms that fan-out costs more than the 30s poll
// it replaces. At 30s the ceiling equals the old poll and quiet orgs pay nothing.
const COALESCE_MS: Record<RealtimeNudgeKind, number> = {
	hosts: 500,
	cloud_workspaces: 500,
	pull_requests: 30_000,
};
const PENDING_KEY = "pendingKinds";

/** Kinds waiting on a broadcast, each with the time it is due. */
type Pending = Partial<Record<RealtimeNudgeKind, number>>;

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
		const pending = (await this.ctx.storage.get<Pending>(PENDING_KEY)) ?? {};
		if (pending[kind] !== undefined) return;
		const dueAt = Date.now() + COALESCE_MS[kind];
		await this.ctx.storage.put(PENDING_KEY, { ...pending, [kind]: dueAt });
		const alarm = await this.ctx.storage.getAlarm();
		if (alarm === null || dueAt < alarm) {
			await this.ctx.storage.setAlarm(dueAt);
		}
	}

	async subscriberCount(): Promise<number> {
		let count = 0;
		for (const _ of this.getConnections()) count++;
		return count;
	}

	// ── Fan-out ───────────────────────────────────────────────────────

	async onAlarm(): Promise<void> {
		const pending = (await this.ctx.storage.get<Pending>(PENDING_KEY)) ?? {};
		const now = Date.now();
		const due: RealtimeNudgeKind[] = [];
		const later: Pending = {};
		for (const [kind, dueAt] of Object.entries(pending) as [
			RealtimeNudgeKind,
			number,
		][]) {
			if (dueAt <= now) due.push(kind);
			else later[kind] = dueAt;
		}
		const remaining = Object.values(later);
		if (remaining.length > 0) {
			await this.ctx.storage.put(PENDING_KEY, later);
			await this.ctx.storage.setAlarm(Math.min(...remaining));
		} else {
			await this.ctx.storage.delete(PENDING_KEY);
		}
		if (due.length === 0) return;
		const message: RealtimeNudgeMessage = { type: "nudge", kinds: due };
		this.broadcast(JSON.stringify(message));
	}
}
