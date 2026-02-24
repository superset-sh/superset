import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
	type MastraChatEventEnvelope,
	type MastraChatEventRow,
	materializeMastraChatState,
	materializeMastraChatStateFromRows,
} from "./index";

const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function ts(offset: number): string {
	return new Date(1_700_100_000_000 + offset * 1000).toISOString();
}

function event(input: {
	kind?: "submit" | "harness";
	sessionId?: string;
	timestamp?: string;
	sequenceHint: number;
	payload: unknown;
}): MastraChatEventEnvelope {
	return {
		kind: input.kind ?? "harness",
		sessionId: input.sessionId ?? SESSION_A,
		timestamp: input.timestamp ?? ts(input.sequenceHint),
		sequenceHint: input.sequenceHint,
		payload: input.payload,
	};
}

function row(
	id: string,
	envelope: MastraChatEventEnvelope,
): MastraChatEventRow {
	return { id, ...envelope };
}

function hashState(state: unknown): string {
	const json = JSON.stringify(state);
	return createHash("sha256").update(json).digest("hex");
}

describe("materializeMastraChatState replay + failure safety", () => {
	it("MZ-MAT-101: is idempotent under duplicate replay for keyed submit and harness events", () => {
		const duplicateSubmit = event({
			kind: "submit",
			sequenceHint: 0,
			payload: {
				type: "user_message_submitted",
				data: {
					content: "hello",
					clientMessageId: "client-dup",
				},
			},
		});

		const duplicateAssistant = event({
			kind: "harness",
			sequenceHint: 1,
			payload: {
				type: "message_end",
				message: {
					id: "assistant-dup",
					role: "assistant",
					content: [{ type: "text", text: "done" }],
					createdAt: ts(1),
				},
			},
		});

		const state = materializeMastraChatState([
			duplicateSubmit,
			duplicateSubmit,
			duplicateSubmit,
			duplicateAssistant,
			duplicateAssistant,
		]);

		expect(state.messages).toHaveLength(2);
		expect(state.messages.map((m) => m.id)).toEqual([
			"client-dup",
			"assistant-dup",
		]);
		expect(state.messages[1]?.text).toBe("done");
	});

	it("MZ-MAT-102: materializeFromRows uses deterministic tie-break for equal timestamp+sequence", () => {
		const timestamp = ts(100);
		const a = row(
			"id-a",
			event({
				sequenceHint: 9,
				timestamp,
				payload: {
					type: "message_end",
					message: {
						id: "msg-a",
						role: "assistant",
						content: [{ type: "text", text: "A" }],
						createdAt: timestamp,
					},
				},
			}),
		);
		const b = row(
			"id-b",
			event({
				sequenceHint: 9,
				timestamp,
				payload: {
					type: "message_end",
					message: {
						id: "msg-b",
						role: "assistant",
						content: [{ type: "text", text: "B" }],
						createdAt: timestamp,
					},
				},
			}),
		);

		const stateAB = materializeMastraChatStateFromRows([b, a]);
		const stateBA = materializeMastraChatStateFromRows([a, b]);

		expect(stateAB.messages.map((m) => m.id)).toEqual(["msg-a", "msg-b"]);
		expect(stateBA.messages.map((m) => m.id)).toEqual(["msg-a", "msg-b"]);
		expect(stateAB).toEqual(stateBA);
	});

	it("MZ-MAT-103: direct materialization preserves caller order (no hidden sorting)", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 20, payload: { type: "agent_start" } }),
			event({
				kind: "submit",
				sequenceHint: 21,
				payload: { type: "control_submitted", data: { action: "abort" } },
			}),
			event({
				sequenceHint: 2,
				payload: { type: "agent_end", reason: "aborted" },
			}),
		]);

		expect(state.sequenceResetCount).toBe(1);
		expect(state.epoch).toBe(2);
		expect(state.controls).toEqual([
			{
				action: "abort",
				submittedAt: ts(21),
				wasRunning: true,
			},
		]);
	});

	it("MZ-MAT-104: large replay remains deterministic across row permutations", () => {
		const rows: MastraChatEventRow[] = [];
		for (let i = 0; i < 5000; i++) {
			rows.push(
				row(
					`row-${i}`,
					event({
						kind: i % 2 === 0 ? "submit" : "harness",
						sequenceHint: i,
						timestamp: ts(i % 97),
						payload:
							i % 2 === 0
								? {
										type: "user_message_submitted",
										data: {
											content: `u-${i}`,
											clientMessageId: `u-${i}`,
										},
									}
								: {
										type: "message_end",
										message: {
											id: `a-${i}`,
											role: "assistant",
											content: [{ type: "text", text: `a-${i}` }],
											createdAt: ts(i % 97),
										},
									},
					}),
				),
			);
		}

		const stateA = materializeMastraChatStateFromRows(rows);
		const stateB = materializeMastraChatStateFromRows([...rows].reverse());

		expect(hashState(stateA)).toBe(hashState(stateB));
		expect(stateA).toEqual(stateB);
	});

	it("MZ-MAT-105: handles three-epoch reset pattern with interleaved controls", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 5, payload: { type: "agent_start" } }),
			event({
				kind: "submit",
				sequenceHint: 6,
				payload: { type: "control_submitted", data: { action: "abort" } },
			}),
			event({
				sequenceHint: 1,
				payload: { type: "agent_end", reason: "aborted" },
			}),
			event({
				kind: "submit",
				sequenceHint: 2,
				payload: { type: "control_submitted", data: { action: "abort" } },
			}),
			event({ sequenceHint: 7, payload: { type: "agent_start" } }),
			event({
				sequenceHint: 0,
				payload: { type: "agent_end", reason: "complete" },
			}),
			event({
				kind: "submit",
				sequenceHint: 3,
				payload: { type: "control_submitted", data: { action: "stop" } },
			}),
		]);

		expect(state.sequenceResetCount).toBe(2);
		expect(state.epoch).toBe(3);
		expect(state.controls.map((c) => c.wasRunning)).toEqual([
			true,
			false,
			false,
		]);
	});

	it("MZ-MAT-601: malformed payload values are non-fatal and isolated", () => {
		expect(() =>
			materializeMastraChatState([
				event({ sequenceHint: 0, payload: "not-an-object" }),
				event({ sequenceHint: 1, payload: 1234 }),
				event({ sequenceHint: 2, payload: null }),
				event({ sequenceHint: 3, payload: { type: "agent_start" } }),
			]),
		).not.toThrow();

		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: "not-an-object" }),
			event({ sequenceHint: 1, payload: { type: "agent_start" } }),
		]);
		expect(state.auxiliaryEvents[0]?.type).toBe("harness_unknown");
		expect(state.isRunning).toBeTrue();
	});

	it("MZ-MAT-602: invalid rows are skipped by policy instead of throwing", () => {
		const valid = row(
			"ok-1",
			event({
				sequenceHint: 0,
				payload: {
					type: "message_end",
					message: {
						id: "ok-message",
						role: "assistant",
						content: [{ type: "text", text: "ok" }],
						createdAt: ts(0),
					},
				},
			}),
		);

		const invalidRows = [
			{ ...valid, timestamp: undefined },
			{ ...valid, sequenceHint: -1 },
			{ ...valid, kind: "other" },
			{ ...valid, id: undefined },
		] as unknown as MastraChatEventRow[];

		const state = materializeMastraChatStateFromRows([
			...invalidRows,
			valid,
		] as MastraChatEventRow[]);

		expect(state.messages).toHaveLength(1);
		expect(state.messages[0]?.id).toBe("ok-message");
	});

	it("MZ-MAT-603: unknown future harness events are retained in auxiliaryEvents", () => {
		const state = materializeMastraChatStateFromRows([
			row(
				"future",
				event({
					sequenceHint: 0,
					payload: { type: "future_event_v2", payloadVersion: 2 },
				}),
			),
		]);
		expect(state.auxiliaryEvents).toHaveLength(1);
		expect(state.auxiliaryEvents[0]?.type).toBe("future_event_v2");
	});

	it("MZ-MAT-604: mixed clock-skew timestamps still produce deterministic output", () => {
		const skewRows: MastraChatEventRow[] = [
			row(
				"late",
				event({
					sequenceHint: 3,
					timestamp: "2026-02-24T08:00:10.000Z",
					payload: {
						type: "message_end",
						message: {
							id: "m-late",
							role: "assistant",
							content: [{ type: "text", text: "late" }],
							createdAt: "2026-02-24T08:00:10.000Z",
						},
					},
				}),
			),
			row(
				"early",
				event({
					sequenceHint: 2,
					timestamp: "2026-02-24T07:59:59.000Z",
					payload: {
						type: "message_end",
						message: {
							id: "m-early",
							role: "assistant",
							content: [{ type: "text", text: "early" }],
							createdAt: "2026-02-24T07:59:59.000Z",
						},
					},
				}),
			),
		];

		const stateA = materializeMastraChatStateFromRows(skewRows);
		const stateB = materializeMastraChatStateFromRows([...skewRows].reverse());
		expect(stateA).toEqual(stateB);
		expect(stateA.messages.map((m) => m.id)).toEqual(["m-early", "m-late"]);
	});
});
