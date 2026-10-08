import { beforeEach, describe, expect, mock, test } from "bun:test";

const memory = new Map<string, string>();
mock.module("@react-native-async-storage/async-storage", () => ({
	default: {
		getItem: async (key: string) => memory.get(key) ?? null,
		setItem: async (key: string, value: string) => {
			memory.set(key, value);
		},
		removeItem: async (key: string) => {
			memory.delete(key);
		},
	},
}));

const { VoiceSessionController } = await import("./VoiceSessionController");
const { useVoiceStore } = await import("../voiceStore");
const { useVoiceLevelsStore } = await import("../voiceLevelsStore");
type RealtimeClientEvent = import("../events").RealtimeClientEvent;
type RealtimeServerEvent = import("../events").RealtimeServerEvent;
type RealtimeTransport =
	import("../transport/RealtimeTransport").RealtimeTransport;
type TransportState = import("../transport/RealtimeTransport").TransportState;
type VoiceData = import("../tools/types").VoiceData;
type VoiceWorkspace = import("../tools/types").VoiceWorkspace;

class FakeTransport implements RealtimeTransport {
	sent: RealtimeClientEvent[] = [];
	muted = false;
	closed = false;
	private listeners = new Set<(event: RealtimeServerEvent) => void>();
	private stateListeners = new Set<(state: TransportState) => void>();
	constructor(private readonly failConnect = false) {}
	async connect() {
		if (this.failConnect) throw new Error("no network");
	}
	send(event: RealtimeClientEvent) {
		this.sent.push(event);
	}
	onEvent(listener: (event: RealtimeServerEvent) => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	onStateChange(listener: (state: TransportState) => void) {
		this.stateListeners.add(listener);
		return () => this.stateListeners.delete(listener);
	}
	setMuted(muted: boolean) {
		this.muted = muted;
	}
	async getLevels() {
		return { input: 0.2, output: 0 };
	}
	close() {
		this.closed = true;
	}
	emit(event: RealtimeServerEvent) {
		for (const listener of this.listeners) listener(event);
	}
	drop() {
		for (const listener of this.stateListeners) listener("closed");
	}
}

const workspace: VoiceWorkspace = {
	id: "ws-auth",
	name: "auth-refactor",
	kind: "host",
	organizationId: "org",
	hostId: "mac",
	hostName: "Mac",
	branch: "auth",
	project: "superset",
	status: "ready",
	attention: "review",
	attentionAt: 1_000,
	lastActivityAt: 1_000,
	createdByMe: true,
};

const data: VoiceData = {
	listWorkspaces: async () => [workspace],
	listSessions: async () => [],
	readTranscript: async () => "",
	sendMessage: async () => {},
	listPullRequests: async () => [],
	listPages: async () => [],
	findPage: async () => null,
	restartWorkspace: async () => {},
	readPage: async () => "",
	listEnvironments: async () => [
		{ id: "env-1", name: "Superset" },
		{ id: "env-2", name: "Docs site" },
	],
	createWorkspace: async () => ({ id: "ws-new", name: "Fix login" }),
	listMachines: async () => [],
	createMachineWorkspace: async () => {
		throw new Error("unused");
	},
	startAgent: async () => ({ terminalId: "t-new", label: "claude" }),
	stopSession: async () => {},
	createTask: async (input) => ({
		key: "SUP-1",
		title: input.title,
		status: null,
		priority: input.priority,
		assignee: null,
	}),
	listTasks: async () => [],
};

function build(options: { failConnect?: boolean; pathname?: string } = {}) {
	const transports: FakeTransport[] = [];
	const routes: string[] = [];
	let pathname = options.pathname ?? "/";
	let nudge: ((message: never) => void) | null = null;
	let ids = 0;
	const controller = new VoiceSessionController({
		store: useVoiceStore,
		levels: useVoiceLevelsStore,
		data,
		mint: async () => ({ clientSecret: "ek_test" }),
		createTransport: () => {
			const transport = new FakeTransport(options.failConnect);
			transports.push(transport);
			return transport;
		},
		router: {
			push: (href) => {
				routes.push(`push ${href}`);
				pathname = href.replace(/\([^)]*\)\//g, "");
			},
			dismissTo: (href) => routes.push(`dismissTo ${href}`),
			dismiss: () => routes.push("dismiss"),
			setParams: (params) => routes.push(`setParams ${JSON.stringify(params)}`),
		},
		getPathname: () => pathname,
		onRealtimeNudge: (listener) => {
			nudge = listener as never;
			return () => {
				nudge = null;
			};
		},
		newId: () => `id-${++ids}`,
		now: () => 5_000,
	});
	return { controller, transports, routes, nudge: () => nudge };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	useVoiceStore.getState().reset();
});

describe("VoiceSessionController", () => {
	test("start mints, connects, and lands in listening", async () => {
		const { controller, transports } = build();
		await controller.start();
		const state = useVoiceStore.getState();
		expect(state.status).toBe("listening");
		expect(transports).toHaveLength(1);
		// The first thing the model hears is where the user is.
		expect(transports[0]?.sent[0]).toMatchObject({
			type: "conversation.item.create",
			item: { role: "system" },
		});
		controller.end();
		expect(useVoiceStore.getState().status).toBe("ended");
		expect(transports[0]?.closed).toBe(true);
	});

	test("a failed connection ends the session with the error on screen", async () => {
		const { controller } = build({ failConnect: true });
		await expect(controller.start()).rejects.toThrow("no network");
		const state = useVoiceStore.getState();
		expect(state.status).toBe("ended");
		expect(state.error).toBe("no network");
	});

	test("a tool call is logged, executed, and moves the app", async () => {
		const { controller, transports, routes } = build();
		await controller.start();
		const transport = transports[0] as FakeTransport;
		transport.emit({ type: "response.created", response: { id: "r1" } });
		transport.emit({
			type: "response.function_call_arguments.done",
			response_id: "r1",
			item_id: "i1",
			call_id: "c1",
			name: "get_workspace",
			arguments: JSON.stringify({ query: "auth" }),
		});
		transport.emit({
			type: "response.done",
			response: { id: "r1", status: "completed" },
		});
		await flush();
		await flush();

		const state = useVoiceStore.getState();
		const tool = state.transcript.find((entry) => entry.role === "tool");
		expect(tool).toMatchObject({
			name: "get_workspace",
			subject: "auth",
			status: "done",
		});
		expect(routes).toEqual(["push /(authenticated)/workspace/ws-auth"]);
		expect(state.focusLabel).toBe("auth-refactor");
		const output = transport.sent.find(
			(event) =>
				event.type === "conversation.item.create" &&
				event.item.type === "function_call_output",
		);
		expect(output).toBeDefined();
		controller.end();
	});

	test("a dropped link reconnects and replays the conversation", async () => {
		const { controller, transports } = build();
		await controller.start();
		useVoiceStore
			.getState()
			.upsertSpeech("u1", "user", "What are my agents up to?", true);
		useVoiceStore
			.getState()
			.upsertSpeech("a1", "assistant", "Three active.", true);
		(transports[0] as FakeTransport).drop();
		expect(useVoiceStore.getState().status).toBe("reconnecting");
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect(transports).toHaveLength(2);
		expect(useVoiceStore.getState().status).toBe("listening");
		const replayed = (transports[1] as FakeTransport).sent.filter(
			(event) =>
				event.type === "conversation.item.create" &&
				event.item.type === "message" &&
				event.item.role !== "system",
		);
		expect(replayed).toHaveLength(2);
		controller.end();
	});

	test("mute reaches the transport and survives a reconnect", async () => {
		const { controller, transports } = build();
		await controller.start();
		controller.setMuted(true);
		expect((transports[0] as FakeTransport).muted).toBe(true);
		(transports[0] as FakeTransport).drop();
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect((transports[1] as FakeTransport).muted).toBe(true);
		controller.end();
	});

	test("speaks up when an agent it started finishes", async () => {
		const { controller, transports } = build();
		await controller.start();
		const transport = transports[0] as FakeTransport;
		transport.emit({ type: "response.created", response: { id: "r1" } });
		transport.emit({
			type: "response.function_call_arguments.done",
			response_id: "r1",
			item_id: "i1",
			call_id: "c1",
			name: "start_agent",
			arguments: JSON.stringify({ workspace: "auth", prompt: "Add tests" }),
		});
		transport.emit({
			type: "response.done",
			response: { id: "r1", status: "completed" },
		});
		await flush();
		await flush();

		const original = data.listSessions;
		const session = (attention: "working" | "review") => [
			{
				terminalId: "t-new",
				workspaceId: "ws-auth",
				title: "claude",
				agentId: "claude",
				attention,
				lastEventAt: 1,
				createdAt: 1,
			},
		];
		try {
			const before = transport.sent.length;
			data.listSessions = async () => session("working");
			await controller.checkWatched();
			expect(transport.sent.length).toBe(before);

			data.listSessions = async () => session("review");
			await controller.checkWatched();
			const told = transport.sent
				.slice(before)
				.find(
					(event) =>
						event.type === "conversation.item.create" &&
						event.item.type === "message" &&
						event.item.content[0]?.text.includes('(session "claude") finished'),
				);
			expect(told).toBeDefined();

			const after = transport.sent.length;
			await controller.checkWatched();
			expect(transport.sent.length).toBe(after);
		} finally {
			data.listSessions = original;
			controller.end();
		}
	});

	test("End while connecting closes the transport and stays ended", async () => {
		const { controller, transports } = build();
		const starting = controller.start();
		controller.end();
		await starting;
		expect(useVoiceStore.getState().status).toBe("ended");
		for (const transport of transports) {
			expect((transport as FakeTransport).closed).toBe(true);
		}
	});
});
