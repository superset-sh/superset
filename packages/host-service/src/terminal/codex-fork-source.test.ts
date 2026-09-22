import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	discoverCodexForkSource,
	resolveCodexRolloutFiles,
	verifiedCodexForkHome,
} from "./codex-fork-source";

const roots: string[] = [];
function rollout(id: string, source: unknown = "cli", metadataId = id) {
	const home = mkdtempSync(join(tmpdir(), "codex-fork-source-"));
	roots.push(home);
	const dir = join(home, "sessions/2026/09/21");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, `rollout-2026-09-21T00-00-00-${id}.jsonl`);
	writeFileSync(
		path,
		`${JSON.stringify({
			type: "session_meta",
			payload: { id: metadataId, source },
		})}\n`,
	);
	return { home, path };
}
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
const first = "01a0bfde-622a-7103-8cc3-ddb312e39832";
const second = "01a0bfde-622a-7103-8cc3-ddb312e39833";
test("resolves actual identity and home, deduplicating descriptors", async () => {
	const file = rollout(first);
	expect(await resolveCodexRolloutFiles([file.path, file.path])).toEqual({
		sessionId: first,
		home: file.home,
	});
});
test("refuses ambiguous concurrent CLI sessions", async () => {
	expect(
		await resolveCodexRolloutFiles([rollout(first).path, rollout(second).path]),
	).toBeNull();
});
test("ignores subagents and mismatched metadata", async () => {
	const file = rollout(first);
	expect(
		await resolveCodexRolloutFiles([
			file.path,
			rollout(second, { subagent: {} }).path,
			rollout(second, "cli", first).path,
		]),
	).toEqual({ sessionId: first, home: file.home });
});
test("refuses missing, truncated, and unrelated files", async () => {
	const file = rollout(first);
	writeFileSync(file.path, '{"type":');
	expect(
		await resolveCodexRolloutFiles([file.path, "/missing.jsonl"]),
	).toBeNull();
});

test("reads session metadata containing large instruction blocks", async () => {
	const file = rollout(first);
	writeFileSync(
		file.path,
		JSON.stringify({
			type: "session_meta",
			payload: {
				id: first,
				source: "cli",
				base_instructions: { text: "x".repeat(100_000) },
			},
		}),
	);
	expect(await resolveCodexRolloutFiles([file.path])).toEqual({
		sessionId: first,
		home: file.home,
	});
});

test.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
	"discovers only files held by the selected process tree",
	async () => {
		const source = rollout(first);
		const other = rollout(second);
		const children = [source, other].map((file) =>
			Bun.spawn(
				[
					process.execPath,
					"-e",
					'require("node:fs").openSync(process.argv[1], "r");console.log("ready");setInterval(()=>{},1000)',
					file.path,
				],
				{ stdout: "pipe", stderr: "pipe" },
			),
		);
		try {
			await Promise.all(
				children.map(async (child) => {
					const reader = child.stdout.getReader();
					await reader.read();
					reader.releaseLock();
				}),
			);
			expect(await discoverCodexForkSource(children[0]?.pid ?? 0)).toEqual({
				sessionId: first,
				home: realpathSync(source.home),
			});
			expect(await discoverCodexForkSource(children[1]?.pid ?? 0)).toEqual({
				sessionId: second,
				home: realpathSync(other.home),
			});
		} finally {
			for (const child of children) child.kill();
			await Promise.all(children.map((child) => child.exited));
		}
	},
	15000,
);

test("pins the launch home rather than shared rollout storage", () => {
	expect(
		verifiedCodexForkHome({
			requestedSessionId: first,
			sessionHome: "/original/account",
			discovered: { sessionId: first, home: "/shared/storage" },
		}),
	).toBe("/original/account");
});
test("refuses missing provenance and a changed actual session", () => {
	expect(
		verifiedCodexForkHome({
			requestedSessionId: first,
			discovered: { sessionId: first, home: "/shared/storage" },
		}),
	).toBeNull();
	expect(
		verifiedCodexForkHome({
			requestedSessionId: first,
			boundSessionId: first,
			sessionHome: "/original/account",
			discovered: { sessionId: second, home: "/original/account" },
		}),
	).toBeNull();
});
test("retains hook-based forking when process inspection is unavailable", () => {
	expect(
		verifiedCodexForkHome({
			requestedSessionId: first,
			boundSessionId: first,
			sessionHome: "/original/account",
			discovered: null,
		}),
	).toBe("/original/account");
});
