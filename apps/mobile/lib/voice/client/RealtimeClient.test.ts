import { describe, expect, test } from "bun:test";
import type { RealtimeClientEvent, RealtimeServerEvent } from "../events";
import type {
	RealtimeTransport,
	TransportState,
} from "../transport/RealtimeTransport";
import { RealtimeClient, type RealtimeClientCallbacks } from "./RealtimeClient";

class FakeTransport implements RealtimeTransport {
	sent: RealtimeClientEvent[] = [];
	private listeners = new Set<(event: RealtimeServerEvent) => void>();
	async connect() {}
	send(event: RealtimeClientEvent) {
		this.sent.push(event);
	}
	onEvent(listener: (event: RealtimeServerEvent) => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	onStateChange(_listener: (state: TransportState) => void) {
		return () => {};
	}
	setMuted() {}
	async getLevels() {
		return { input: 0, output: 0 };
	}
	close() {}
	emit(event: RealtimeServerEvent) {
		for (const listener of this.listeners) listener(event);
	}
}

function setup(overrides: Partial<RealtimeClientCallbacks> = {}) {
	const transport = new FakeTransport();
	const statuses: string[] = [];
	const user: Array<[string, string, boolean]> = [];
	const assistant: Array<[string, string, boolean]> = [];
	const calls: Array<{ name: string; args: unknown }> = [];
	const callbacks: RealtimeClientCallbacks = {
		onStatus: (status) => statuses.push(status),
		onUserTranscript: (id, text, final) => user.push([id, text, final]),
		onAssistantTranscript: (id, text, final) =>
			assistant.push([id, text, final]),
		onToolCall: async (call) => {
			calls.push({ name: call.name, args: call.args });
			return { output: { ok: call.name } };
		},
		onError: () => {},
		...overrides,
	};
	const client = new RealtimeClient(transport, callbacks);
	client.start();
	return { transport, client, statuses, user, assistant, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("RealtimeClient", () => {
	test("accumulates transcript deltas and finalises on completion", () => {
		const { transport, user, assistant } = setup();
		transport.emit({
			type: "conversation.item.input_audio_transcription.delta",
			item_id: "u1",
			delta: "What are ",
		});
		transport.emit({
			type: "conversation.item.input_audio_transcription.delta",
			item_id: "u1",
			delta: "my agents up to?",
		});
		transport.emit({
			type: "conversation.item.input_audio_transcription.completed",
			item_id: "u1",
			transcript: "What are my agents up to?",
		});
		expect(user.at(-2)).toEqual(["u1", "What are my agents up to?", false]);
		expect(user.at(-1)).toEqual(["u1", "What are my agents up to?", true]);

		transport.emit({
			type: "response.output_audio_transcript.delta",
			response_id: "r1",
			item_id: "a1",
			delta: "Three ",
		});
		transport.emit({
			type: "response.output_audio_transcript.done",
			response_id: "r1",
			item_id: "a1",
			transcript: "Three active.",
		});
		expect(assistant).toEqual([
			["a1", "Three ", false],
			["a1", "Three active.", true],
		]);
	});

	test("status follows speech and the output audio buffer", () => {
		const { transport, statuses } = setup();
		transport.emit({
			type: "input_audio_buffer.speech_started",
			item_id: "u1",
		});
		transport.emit({ type: "response.created", response: { id: "r1" } });
		transport.emit({ type: "output_audio_buffer.started", response_id: "r1" });
		transport.emit({
			type: "response.done",
			response: { id: "r1", status: "completed" },
		});
		transport.emit({ type: "output_audio_buffer.stopped", response_id: "r1" });
		expect(statuses).toEqual([
			"listening",
			"thinking",
			"speaking",
			"listening",
		]);
	});

	test("runs tool calls and asks for one response after all outputs land", async () => {
		const { transport, calls } = setup();
		transport.emit({ type: "response.created", response: { id: "r1" } });
		transport.emit({
			type: "response.function_call_arguments.done",
			response_id: "r1",
			item_id: "i1",
			call_id: "c1",
			name: "list_workspaces",
			arguments: '{"filter":"active"}',
		});
		transport.emit({
			type: "response.function_call_arguments.done",
			response_id: "r1",
			item_id: "i2",
			call_id: "c2",
			name: "list_pages",
			arguments: "",
		});
		transport.emit({
			type: "response.done",
			response: { id: "r1", status: "completed" },
		});
		await flush();
		await flush();

		expect(calls).toEqual([
			{ name: "list_workspaces", args: { filter: "active" } },
			{ name: "list_pages", args: {} },
		]);
		const outputs = transport.sent.filter(
			(event) => event.type === "conversation.item.create",
		);
		expect(outputs).toHaveLength(2);
		expect(
			transport.sent.filter((event) => event.type === "response.create"),
		).toHaveLength(1);
		expect(transport.sent.at(-1)?.type).toBe("response.create");
	});

	test("a failing executor still answers the model", async () => {
		const { transport } = setup({
			onToolCall: async () => {
				throw new Error("host unreachable");
			},
		});
		transport.emit({ type: "response.created", response: { id: "r1" } });
		transport.emit({
			type: "response.function_call_arguments.done",
			response_id: "r1",
			item_id: "i1",
			call_id: "c1",
			name: "read_session",
			arguments: "{}",
		});
		transport.emit({
			type: "response.done",
			response: { id: "r1", status: "completed" },
		});
		await flush();
		await flush();
		const output = transport.sent.find(
			(event) => event.type === "conversation.item.create",
		);
		expect(
			output && "item" in output && output.item.type === "function_call_output"
				? JSON.parse(output.item.output)
				: null,
		).toEqual({ error: "host unreachable" });
	});

	test("context items are system messages that do not trigger a reply", () => {
		const { transport, client } = setup();
		client.addContext("[context] User is now viewing workspace auth-refactor");
		expect(transport.sent).toEqual([
			{
				type: "conversation.item.create",
				item: {
					type: "message",
					role: "system",
					content: [
						{
							type: "input_text",
							text: "[context] User is now viewing workspace auth-refactor",
						},
					],
				},
			},
		]);
	});
});
