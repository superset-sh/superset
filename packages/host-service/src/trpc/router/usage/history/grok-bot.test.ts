import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeBase32, readGrokBotAgents } from "./grok-bot";

function encodeBase32(text: string): string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of Buffer.from(text, "utf-8")) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			out += alphabet[(value >> bits) & 31];
		}
	}
	if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
	return out;
}

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function writeSlice(dataDir: string, key: string, value: unknown): void {
	const dir = join(dataDir, "sand-client-persistence");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${encodeBase32(key)}.blob`),
		JSON.stringify({ schemaVersion: 3, value }),
	);
}

describe("decodeBase32", () => {
	test("decodes the app's unpadded lowercase slice keys", () => {
		expect(decodeBase32("onqw4zbomnwgszlooqxhg3djmnss45ljfvwgc6lpov2a")).toBe(
			"sand.client.slice.ui-layout",
		);
	});
});

describe("readGrokBotAgents", () => {
	test("reads Bot ids, names and group members from the roster slice", async () => {
		const dataDir = mkdtempSync(join(tmpdir(), "grok-bot-"));
		dirs.push(dataDir);
		const account = "sand.client.slice.account.github%7Cuser_1";
		writeSlice(dataDir, `${account}.roster.last-roster`, {
			rows: [
				{ id: "bot-1", name: "Engineer" },
				{ id: "group-1", name: "Standup", memberIds: ["bot-1", "bot-2"] },
			],
		});
		writeSlice(dataDir, `${account}.selection.last-agent`, {
			rows: [{ id: "not-a-bot", name: "ignored" }],
		});

		const agents = await readGrokBotAgents([dataDir]);
		expect([...agents.entries()]).toEqual([
			["bot-1", "Engineer"],
			["group-1", "Standup"],
			["bot-2", ""],
		]);
	});

	test("returns nothing when the app was never installed", async () => {
		expect(
			(await readGrokBotAgents([join(tmpdir(), "no-grok-bot")])).size,
		).toBe(0);
	});

	test("merges the Windows legacy Sand folder with the current one", async () => {
		const root = mkdtempSync(join(tmpdir(), "grok-bot-"));
		dirs.push(root);
		const roster = "sand.client.slice.account.a.roster.last-roster";
		writeSlice(join(root, "Grok Bot"), roster, {
			rows: [{ id: "bot-1", name: "New" }],
		});
		writeSlice(join(root, "Sand"), roster, {
			rows: [{ id: "bot-2", name: "Old" }],
		});

		const agents = await readGrokBotAgents([
			join(root, "Grok Bot"),
			join(root, "Sand"),
		]);
		expect(Object.fromEntries(agents)).toEqual({
			"bot-1": "New",
			"bot-2": "Old",
		});
	});
});
