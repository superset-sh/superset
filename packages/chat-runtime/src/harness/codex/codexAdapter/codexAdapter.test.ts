import { describe, expect, test } from "bun:test";
import type {
	AgentMessage,
	ApprovalRequest,
	Item,
	SessionState,
	ToolCall,
	Turn,
} from "@superset/chat/protocol";
import { itemSchema, turnSchema } from "@superset/chat/protocol";
import type { AdapterEvent } from "../../types";
import { FixturePlayer } from "../fixturePlayer";
import type { CodexFixtureName } from "../fixtures";
import { fixtureCwd, loadCodexFixture } from "../fixtures";
import { CodexAdapter } from "./codexAdapter";

const FIXED_NOW = 1_785_000_000_000;

type ReplayOptions = {
	onEvent?(event: AdapterEvent, adapter: CodexAdapter): void;
};

type ReplayResult = {
	events: AdapterEvent[];
	player: FixturePlayer;
};

async function settle(ticks = 8): Promise<void> {
	for (let index = 0; index < ticks; index += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

async function replay(
	name: CodexFixtureName,
	options: ReplayOptions = {},
): Promise<ReplayResult> {
	const frames = loadCodexFixture(name);
	const player = new FixturePlayer(frames);
	let minted = 0;
	const adapter = new CodexAdapter({
		createTransport: (_spawnOptions, handlers) => player.transport(handlers),
		now: () => FIXED_NOW,
		mintId: () => {
			minted += 1;
			return `minted-${minted}`;
		},
	});

	const events: AdapterEvent[] = [];
	const pump = (async () => {
		for await (const event of adapter.start({ cwd: fixtureCwd(frames) })) {
			events.push(event);
			options.onEvent?.(event, adapter);
		}
	})();

	adapter.prompt([{ type: "text", text: "fixture prompt" }]);

	const deadline = Date.now() + 5000;
	while (!player.exhausted) {
		if (Date.now() > deadline) throw new Error(`fixture ${name} stalled`);
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	await settle();
	await adapter.dispose();
	await pump;
	return { events, player };
}

function items(events: AdapterEvent[]): Item[] {
	return events.flatMap((event) => (event.kind === "item" ? [event.item] : []));
}

function turns(events: AdapterEvent[]): Turn[] {
	return events.flatMap((event) => (event.kind === "turn" ? [event.turn] : []));
}

function sessions(events: AdapterEvent[]): Partial<SessionState>[] {
	return events.flatMap((event) =>
		event.kind === "session" ? [event.session] : [],
	);
}

function lastById(events: AdapterEvent[], id: string): Item {
	const matching = items(events).filter((item) => item.id === id);
	const last = matching.at(-1);
	if (!last) throw new Error(`no item ${id}`);
	return last;
}

function toolCalls(events: AdapterEvent[]): ToolCall[] {
	return items(events).filter(
		(item): item is ToolCall => item.kind === "tool_call",
	);
}

describe("codexAdapter fixtures", () => {
	test("every fixture emits protocol-valid items and turns", async () => {
		for (const name of ["text", "command", "fileChange"] as const) {
			const { events } = await replay(name);
			for (const item of items(events)) {
				expect(() => itemSchema.parse(item)).not.toThrow();
			}
			for (const turn of turns(events)) {
				expect(() => turnSchema.parse(turn)).not.toThrow();
			}
		}
	});

	test("a plain text turn maps to session, turn, agent message and deltas", async () => {
		const { events, player } = await replay("text");

		expect(player.methodsSent).toEqual([
			"initialize",
			"initialized",
			"thread/start",
			"turn/start",
		]);

		const sessionStates = sessions(events);
		expect(sessionStates[0]).toEqual({ status: "starting" });
		expect(sessionStates[1]).toMatchObject({
			status: "idle",
			modeId: "auto",
			modelId: "gpt-5.5",
			availableModes: [
				{ id: "read-only", label: "Read Only" },
				{ id: "auto", label: "Auto" },
				{ id: "full-access", label: "Full Access" },
			],
		});

		const message = items(events).find(
			(item): item is AgentMessage => item.kind === "agent_message",
		);
		expect(message?.text).toBe("");

		const settled = lastById(events, message?.id ?? "") as AgentMessage;
		expect(settled.text).toBe("hello");
		expect(settled.completedAtMs).toBeGreaterThan(0);

		expect(events.filter((event) => event.kind === "delta")).toEqual([
			{
				kind: "delta",
				delta: { type: "text", itemId: settled.id, append: "hello" },
			},
		]);

		const turnStates = turns(events);
		expect(turnStates[0]?.status).toBe("running");
		const final = turnStates.at(-1);
		expect(final?.status).toBe("completed");
		expect(final?.usage).toEqual({
			inputTokens: 13355,
			cachedInputTokens: 2432,
			outputTokens: 22,
			contextUsed: 13377,
			contextSize: 258400,
		});
	});

	test("the runtime owns user messages: the adapter never emits one", async () => {
		for (const name of ["text", "command", "approval"] as const) {
			const { events } = await replay(name, {
				onEvent: (event, adapter) => {
					if (event.kind !== "item") return;
					if (event.item.kind !== "approval_request") return;
					const approval = event.item as ApprovalRequest;
					if (approval.status !== "pending") return;
					adapter.respondToApproval(approval.id, { type: "accept" });
				},
			});
			expect(
				items(events).filter((item) => item.kind === "user_message"),
			).toEqual([]);
		}
	});

	test("a shell command maps to an execute tool call with terminal content", async () => {
		const { events } = await replay("command");
		const call = toolCalls(events).at(-1);

		expect(call).toMatchObject({
			kind: "tool_call",
			toolName: "commandExecution",
			toolKind: "execute",
			title: "echo superset-probe",
			status: "completed",
		});
		expect(call?.content).toEqual([
			{
				type: "terminal",
				command: "/bin/zsh -lc 'echo superset-probe'",
				output: "superset-probe\n",
				exitCode: 0,
			},
		]);
	});

	test("a created file maps to a diff with a null oldText", async () => {
		const { events } = await replay("fileChange");
		const call = toolCalls(events).at(-1);

		expect(call).toMatchObject({
			toolName: "fileChange",
			toolKind: "edit",
			title: "Create notes.txt",
			status: "completed",
		});
		expect(call?.content).toEqual([
			{ type: "diff", path: "notes.txt", oldText: null, newText: "hi\n" },
		]);
		expect(call?.locations).toEqual([{ path: "notes.txt" }]);
	});

	test("an edited file reconstructs both sides of the hunk", async () => {
		const { events } = await replay("fileEdit");
		const edit = toolCalls(events).find(
			(call) => call.toolName === "fileChange",
		);

		expect(edit?.title).toBe("Edit notes.txt");
		expect(edit?.content).toEqual([
			{
				type: "diff",
				path: "notes.txt",
				oldText: "alpha\nbeta\ngamma\n",
				newText: "alpha\nBETA\ngamma\n",
			},
		]);

		const search = toolCalls(events).find((call) => call.toolKind === "search");
		expect(search?.title).toBe("Search \\bbeta\\b in notes.txt");
		expect(search?.locations).toEqual([{ path: "notes.txt" }]);
	});

	test("an approval round trip binds to its tool call and answers with the decision", async () => {
		const answered: string[] = [];
		const { events } = await replay("approval", {
			onEvent: (event, adapter) => {
				if (event.kind !== "item") return;
				if (event.item.kind !== "approval_request") return;
				const approval = event.item as ApprovalRequest;
				if (approval.status !== "pending") return;
				answered.push(approval.id);
				adapter.respondToApproval(approval.id, { type: "accept" });
			},
		});

		const approvals = items(events).filter(
			(item): item is ApprovalRequest => item.kind === "approval_request",
		);
		const pending = approvals[0];
		expect(pending).toBeDefined();
		expect(pending?.id).toBe("approval:call_LThMNKSLHftjsTeRtUIyAyTa");
		expect(pending?.targetItemId).toBe("call_LThMNKSLHftjsTeRtUIyAyTa");
		expect(pending?.title).toBe(
			"Do you want to allow creating approved.txt in the current directory?",
		);
		expect(pending?.options).toEqual([
			{ optionId: "accept", label: "Approve" },
			{
				optionId: "acceptWithExecpolicyAmendment",
				label: "Approve and always allow this command",
			},
			{ optionId: "cancel", label: "Stop" },
		]);
		expect(pending?.detail).toEqual([
			{
				type: "terminal",
				command: "/bin/zsh -lc 'touch approved.txt'",
				output: "",
			},
		]);

		expect(sessions(events)).toContainEqual({ status: "awaiting_input" });

		const settled = approvals.at(-1);
		expect(settled?.status).toBe("answered");
		expect(settled?.decision).toEqual({ type: "accept" });
		expect(answered).toHaveLength(1);
	});

	test("an interrupt settles the in-flight message with its streamed text", async () => {
		let canceled = false;
		const { events, player } = await replay("interrupt", {
			onEvent: (event, adapter) => {
				if (canceled || event.kind !== "delta") return;
				canceled = true;
				adapter.cancelTurn();
			},
		});

		expect(player.methodsSent).toContain("turn/interrupt");

		const final = turns(events).at(-1);
		expect(final?.status).toBe("interrupted");

		const message = items(events).find(
			(item): item is AgentMessage => item.kind === "agent_message",
		);
		const settled = lastById(events, message?.id ?? "") as AgentMessage;
		expect(settled.completedAtMs).toBe(FIXED_NOW);
		expect(settled.text.startsWith("1\n2\n3\n")).toBe(true);
		expect(settled.text.endsWith("36")).toBe(true);
	});
});
