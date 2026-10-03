import { describe, expect, test } from "bun:test";
import type { AdapterEvent } from "../../types";
import {
	ClaudeAdapter,
	type ClaudeQuery,
	type ClaudeSession,
} from "./claudeAdapter";

type Harness = {
	adapter: ClaudeAdapter;
	iterator: AsyncIterator<AdapterEvent>;
	emit: (message: unknown) => void;
	interrupts: number;
	aborted: () => boolean;
};

function messageStart(id: string): unknown {
	return {
		type: "stream_event",
		event: { type: "message_start", message: { id } },
	};
}

function result(): unknown {
	return {
		type: "result",
		subtype: "success",
		is_error: false,
		usage: { input_tokens: 1, output_tokens: 1 },
	};
}

function createHarness(): Harness {
	const pending: unknown[] = [];
	let notify: (() => void) | null = null;
	let aborted = false;
	const state = { interrupts: 0 };

	const stream: ClaudeSession = {
		async *[Symbol.asyncIterator]() {
			while (true) {
				const next = pending.shift();
				if (next !== undefined) {
					yield next;
					continue;
				}
				await new Promise<void>((resolve) => {
					notify = resolve;
				});
			}
		},
		interrupt: async () => {
			state.interrupts += 1;
		},
	};

	const query: ClaudeQuery = ({ options }) => {
		options.abortController?.signal.addEventListener("abort", () => {
			aborted = true;
		});
		return stream;
	};

	const adapter = new ClaudeAdapter({ query });
	const iterator = adapter.start({ cwd: "/workspace" })[Symbol.asyncIterator]();

	return {
		adapter,
		iterator,
		emit: (message: unknown) => {
			pending.push(message);
			const resume = notify;
			notify = null;
			resume?.();
		},
		get interrupts() {
			return state.interrupts;
		},
		aborted: () => aborted,
	};
}

async function nextTurn(
	iterator: AsyncIterator<AdapterEvent>,
): Promise<AdapterEvent> {
	for (let index = 0; index < 20; index += 1) {
		const next = await iterator.next();
		if (next.done) throw new Error("stream ended");
		if (next.value.kind === "turn") return next.value;
	}
	throw new Error("no turn event");
}

describe("ClaudeAdapter", () => {
	test("a canceled turn interrupts the session without killing it, and the next prompt runs", async () => {
		const harness = createHarness();

		harness.adapter.prompt([{ type: "text", text: "first" }]);
		harness.emit(messageStart("msg_1"));
		const firstTurn = await nextTurn(harness.iterator);
		expect(firstTurn).toMatchObject({ turn: { status: "running" } });

		harness.adapter.cancelTurn();
		expect(harness.interrupts).toBe(1);
		expect(harness.aborted()).toBe(false);

		harness.emit(result());
		const canceled = await nextTurn(harness.iterator);
		expect(canceled).toMatchObject({ turn: { status: "interrupted" } });

		harness.adapter.prompt([{ type: "text", text: "second" }]);
		harness.emit(messageStart("msg_2"));
		const secondTurn = await nextTurn(harness.iterator);
		expect(secondTurn).toMatchObject({ turn: { status: "running" } });
		expect(
			secondTurn.kind === "turn" && firstTurn.kind === "turn"
				? secondTurn.turn.id !== firstTurn.turn.id
				: false,
		).toBe(true);
	});

	test("dispose aborts the underlying session", async () => {
		const harness = createHarness();
		harness.adapter.prompt([{ type: "text", text: "first" }]);
		harness.emit(messageStart("msg_1"));
		await nextTurn(harness.iterator);

		const disposal = harness.adapter.dispose();
		expect(harness.aborted()).toBe(true);
		harness.emit(result());
		await Promise.race([
			disposal,
			new Promise((resolve) => setTimeout(resolve, 50)),
		]);
	});
});
