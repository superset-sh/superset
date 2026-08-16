import type { SupersetPluginApi } from "@superset/plugin-sdk";

const BUCKET_MS = 10_000;
const BUCKET_COUNT = 12;

interface TerminalStats {
	terminalId: string;
	workspaceId: string;
	agentId: string;
	events: number;
	turns: number;
	blocked: number;
	startedAt: number;
	lastEventAt: number;
	lastEventType: string;
	activeMs: number;
	lastStartAt: number | null;
	buckets: number[];
	lastBucketStamp: number;
}

interface LifecyclePayload {
	terminalId: string;
	workspaceId: string;
	eventType: string;
	agent?: { agentId?: string };
	occurredAt: number;
}

function bumpBuckets(stats: TerminalStats, occurredAt: number): void {
	const stamp = Math.floor(occurredAt / BUCKET_MS);
	if (stamp > stats.lastBucketStamp) {
		const stale = Math.min(BUCKET_COUNT, stamp - stats.lastBucketStamp);
		for (let i = 1; i <= stale; i++) {
			stats.buckets[(stats.lastBucketStamp + i) % BUCKET_COUNT] = 0;
		}
		stats.lastBucketStamp = stamp;
	}
	stats.buckets[stamp % BUCKET_COUNT] += 1;
}

export default async function plugin(api: SupersetPluginApi) {
	const stats = new Map<string, TerminalStats>();
	const saved = await api.storage.get<TerminalStats[]>("stats");
	for (const row of saved ?? []) stats.set(row.terminalId, row);

	const enriched = async () => {
		const workspaces = await api.workspaces.list();
		const byId = new Map(workspaces.map((w) => [w.id, w]));
		return [...stats.values()]
			.sort((a, b) => b.lastEventAt - a.lastEventAt)
			.map((row) => ({
				...row,
				workspaceName:
					byId.get(row.workspaceId)?.name || row.workspaceId.slice(0, 8),
				branch: byId.get(row.workspaceId)?.branch ?? null,
			}));
	};

	const publish = async () => {
		await api.storage.set("stats", [...stats.values()]);
		api.realtime.publish({ type: "stats", rows: await enriched() });
	};

	const record = (
		terminalId: string,
		workspaceId: string,
		agentId: string | undefined,
		eventType: string,
		occurredAt: number,
	) => {
		let row = stats.get(terminalId);
		if (!row) {
			row = {
				terminalId,
				workspaceId,
				agentId: agentId ?? "agent",
				events: 0,
				turns: 0,
				blocked: 0,
				startedAt: occurredAt,
				lastEventAt: occurredAt,
				lastEventType: eventType,
				activeMs: 0,
				lastStartAt: null,
				buckets: new Array(BUCKET_COUNT).fill(0),
				lastBucketStamp: Math.floor(occurredAt / BUCKET_MS),
			};
			stats.set(terminalId, row);
		}
		if (agentId) row.agentId = agentId;
		row.events += 1;
		row.lastEventAt = occurredAt;
		row.lastEventType = eventType;
		bumpBuckets(row, occurredAt);
		if (eventType === "Start") {
			row.lastStartAt = occurredAt;
		} else if (eventType === "Stop") {
			row.turns += 1;
			if (row.lastStartAt !== null) {
				row.activeMs += Math.max(0, occurredAt - row.lastStartAt);
				row.lastStartAt = null;
			}
		} else if (eventType === "PermissionRequest") {
			row.blocked += 1;
		}
	};

	api.events.on("agent.lifecycle", (event) => {
		const msg = event.payload as unknown as LifecyclePayload;
		record(
			msg.terminalId,
			msg.workspaceId,
			msg.agent?.agentId,
			msg.eventType,
			msg.occurredAt,
		);
		void publish();
	});

	api.events.on("terminal.exit", (event) => {
		const msg = event.payload as { terminalId?: string; occurredAt: number };
		const row = msg.terminalId ? stats.get(msg.terminalId) : undefined;
		if (!row) return;
		record(row.terminalId, row.workspaceId, undefined, "Exit", msg.occurredAt);
		void publish();
	});

	api.actions.register("get-stats", async () => ({ rows: await enriched() }));

	api.actions.register("reset", async () => {
		stats.clear();
		await api.storage.delete("stats");
		api.realtime.publish({ type: "stats", rows: [] });
		return { cleared: true };
	});
}
