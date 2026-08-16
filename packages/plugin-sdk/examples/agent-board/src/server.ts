import type { SupersetPluginApi } from "@superset/plugin-sdk";

type CardStatus = "working" | "blocked" | "failed" | "done" | "idle" | "ended";

interface Card {
	terminalId: string;
	workspaceId: string;
	agentId: string;
	status: CardStatus;
	eventType: string;
	at: number;
}

interface LifecyclePayload {
	terminalId: string;
	workspaceId: string;
	eventType: string;
	agent?: { agentId?: string };
	occurredAt: number;
}

function statusFor(eventType: string): CardStatus {
	switch (eventType) {
		case "Start":
			return "working";
		case "PermissionRequest":
			return "blocked";
		case "Failed":
			return "failed";
		case "Stop":
			return "done";
		case "Attached":
			return "idle";
		default:
			return "ended";
	}
}

export default async function plugin(api: SupersetPluginApi) {
	const board = new Map<string, Card>();
	const saved = await api.storage.get<Card[]>("board");
	for (const card of saved ?? []) board.set(card.terminalId, card);

	const enriched = async () => {
		const workspaces = await api.workspaces.list();
		const byId = new Map(workspaces.map((w) => [w.id, w]));
		return [...board.values()]
			.sort((a, b) => b.at - a.at)
			.map((card) => ({
				...card,
				workspaceName:
					byId.get(card.workspaceId)?.name || card.workspaceId.slice(0, 8),
				branch: byId.get(card.workspaceId)?.branch ?? null,
			}));
	};

	const publish = async () => {
		await api.storage.set("board", [...board.values()]);
		api.realtime.publish({ type: "board", cards: await enriched() });
	};

	api.events.on("agent.lifecycle", (event) => {
		const msg = event.payload as unknown as LifecyclePayload;
		board.set(msg.terminalId, {
			terminalId: msg.terminalId,
			workspaceId: msg.workspaceId,
			agentId: msg.agent?.agentId ?? "agent",
			status: statusFor(msg.eventType),
			eventType: msg.eventType,
			at: msg.occurredAt,
		});
		void publish();
	});

	api.events.on("terminal.exit", (event) => {
		const msg = event.payload as { terminalId?: string; occurredAt: number };
		const card = msg.terminalId ? board.get(msg.terminalId) : undefined;
		if (card && card.status !== "done" && card.status !== "failed") {
			card.status = "ended";
			card.at = msg.occurredAt;
			void publish();
		}
	});

	api.actions.register("get-board", async () => ({ cards: await enriched() }));

	api.actions.register("clear-finished", async () => {
		for (const [id, card] of board) {
			if (card.status === "done" || card.status === "ended") board.delete(id);
		}
		await publish();
		return { remaining: board.size };
	});
}
