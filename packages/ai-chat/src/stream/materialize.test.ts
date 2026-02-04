import { describe, expect, it } from "bun:test";
import { materializeMessages } from "./materialize";

type ChunkInput = {
	id: string;
	type: "user_input";
	content: string;
	actorId: string;
	createdAt?: string;
	_seq?: number;
};

const makeUserChunk = ({
	id,
	createdAt,
	_seq,
}: {
	id: string;
	createdAt?: string;
	_seq?: number;
}): ChunkInput => ({
	id,
	type: "user_input",
	content: `msg-${id}`,
	actorId: "user-1",
	createdAt,
	_seq,
});

describe("materializeMessages ordering", () => {
	it("orders by _seq when available", () => {
		const chunks = [
			makeUserChunk({
				id: "a",
				createdAt: "2024-01-01T00:00:02.000Z",
				_seq: 2,
			}),
			makeUserChunk({
				id: "b",
				createdAt: "2024-01-01T00:00:01.000Z",
				_seq: 1,
			}),
		];

		const messages = materializeMessages(chunks);
		expect(messages.map((m) => m.id)).toEqual(["b", "a"]);
	});

	it("falls back to createdAt when _seq is missing", () => {
		const chunks = [
			makeUserChunk({
				id: "a",
				createdAt: "2024-01-01T00:00:02.000Z",
			}),
			makeUserChunk({
				id: "b",
				createdAt: "2024-01-01T00:00:01.000Z",
			}),
		];

		const messages = materializeMessages(chunks);
		expect(messages.map((m) => m.id)).toEqual(["b", "a"]);
	});

	it("preserves input order when both _seq and createdAt are missing", () => {
		const chunks = [
			makeUserChunk({ id: "a" }),
			makeUserChunk({ id: "b" }),
			makeUserChunk({ id: "c" }),
		];

		const messages = materializeMessages(chunks);
		expect(messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
	});
});
