import type { SupersetPluginApi } from "@superset/plugin-sdk";

type SheepStatus = "working" | "blocked" | "done" | "idle" | "ended";

interface Sheep {
	terminalId: string;
	workspaceId: string;
	agentId: string;
	status: SheepStatus;
	at: number;
}

interface LifecyclePayload {
	terminalId: string;
	workspaceId: string;
	eventType: string;
	agent?: { agentId?: string };
	occurredAt: number;
}

function statusFor(eventType: string): SheepStatus {
	switch (eventType) {
		case "Start":
			return "working";
		case "PermissionRequest":
		case "Failed":
			return "blocked";
		case "Stop":
			return "done";
		case "Attached":
			return "idle";
		default:
			return "ended";
	}
}

export default async function plugin(api: SupersetPluginApi) {
	const flock = new Map<string, Sheep>();
	const saved = await api.storage.get<Sheep[]>("flock");
	for (const sheep of saved ?? []) flock.set(sheep.terminalId, sheep);

	const enriched = async () => {
		const workspaces = await api.workspaces.list();
		const byId = new Map(workspaces.map((w) => [w.id, w]));
		return [...flock.values()].map((sheep) => ({
			...sheep,
			workspaceName:
				byId.get(sheep.workspaceId)?.name || sheep.workspaceId.slice(0, 8),
		}));
	};

	const publish = async () => {
		await api.storage.set("flock", [...flock.values()]);
		api.realtime.publish({ type: "flock", sheep: await enriched() });
	};

	api.events.on("agent.lifecycle", (event) => {
		const msg = event.payload as unknown as LifecyclePayload;
		flock.set(msg.terminalId, {
			terminalId: msg.terminalId,
			workspaceId: msg.workspaceId,
			agentId: msg.agent?.agentId ?? "agent",
			status: statusFor(msg.eventType),
			at: msg.occurredAt,
		});
		void publish();
	});

	api.events.on("terminal.exit", (event) => {
		const msg = event.payload as { terminalId?: string; occurredAt: number };
		const sheep = msg.terminalId ? flock.get(msg.terminalId) : undefined;
		if (sheep && sheep.status !== "done") {
			sheep.status = "ended";
			sheep.at = msg.occurredAt;
			void publish();
		}
	});

	api.actions.register("get-flock", async () => ({ sheep: await enriched() }));

	api.actions.register("shear", async () => {
		flock.clear();
		await publish();
		return { ok: true };
	});
}
