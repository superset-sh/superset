import { afterEach, describe, expect, test } from "bun:test";
import {
	appendFile,
	mkdir,
	mkdtemp,
	readdir,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionAccount } from "../usage/session-account/session-account";
import {
	inspectAccountResumeHistory,
	sameAccountResumeHistory,
} from "./account-resume-history";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});
const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
async function fixture(provider: "claude" | "codex" = "claude") {
	const temporary = await mkdtemp(
		join(tmpdir(), "superset-account-resume-history-"),
	);
	roots.push(temporary);
	const root = await realpath(temporary);
	const cwd = join(root, "workspace");
	const shared = join(root, "shared");
	const lock = join(root, "locks");
	const sourceDir = join(root, "source");
	const targetDir = join(root, "target");
	await Promise.all(
		[cwd, shared, lock, sourceDir, targetDir].map((path) => mkdir(path)),
	);
	for (const dir of [sourceDir, targetDir]) {
		await symlink(
			shared,
			join(dir, provider === "claude" ? "projects" : "sessions"),
		);
		if (provider === "codex")
			await symlink(lock, join(dir, "thread-writer-locks"));
	}
	const project = join(
		shared,
		provider === "claude" ? "project" : "2026/10/09",
	);
	await mkdir(project, { recursive: true });
	const file = join(
		project,
		provider === "claude"
			? `${id}.jsonl`
			: `rollout-2026-10-09T10-10-10-${id}.jsonl`,
	);
	const record =
		provider === "claude"
			? {
					type: "user",
					sessionId: id,
					cwd,
					message: { role: "user", content: "synthetic" },
					uuid: "11111111-2222-3333-4444-555555555555",
				}
			: { type: "session_meta", payload: { id, cwd } };
	await writeFile(
		file,
		`${JSON.stringify(record)}\n${provider === "codex" ? `${JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "synthetic" }] } })}\n` : ""}`,
	);
	const source: SessionAccount = {
		agent: provider,
		selection: sourceDir,
		directory: sourceDir,
		identity: "a".repeat(64),
		credentialKind: "subscription",
	};
	const target = {
		...source,
		selection: targetDir,
		directory: targetDir,
		identity: "b".repeat(64),
	};
	return {
		root,
		shared,
		file,
		record,
		source,
		target,
		input: { source, target, sessionId: id, cwd },
	};
}

describe("exact shared history required for account resume", () => {
	test.each([
		"claude",
		"codex",
	] as const)("accepts one exact %s transcript in the shared store without copying it", async (provider) => {
		const f = await fixture(provider);
		const before = await readdir(f.shared, { recursive: true });
		const first = await inspectAccountResumeHistory(f.input);
		expect(first.path).toBe(await realpath(f.file));
		expect(first.size).toBeGreaterThan(0);
		expect(
			sameAccountResumeHistory(
				first,
				await inspectAccountResumeHistory(f.input),
			),
		).toBe(true);
		expect(await readdir(f.shared, { recursive: true })).toEqual(before);
	});

	test("rejects a different recorded worktree", async () => {
		const f = await fixture();
		await writeFile(f.file, JSON.stringify({ ...f.record, cwd: f.root }));
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"unavailable or ambiguous",
		);
	});

	test("rejects an ID that exists only in a filename", async () => {
		const f = await fixture();
		await writeFile(
			f.file,
			JSON.stringify({ ...f.record, sessionId: "other-id" }),
		);
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"unavailable or ambiguous",
		);
	});

	test("rejects two exact Claude transcript copies even when the working folder matches", async () => {
		const f = await fixture();
		const other = join(f.shared, "other-project");
		await mkdir(other);
		await writeFile(join(other, `${id}.jsonl`), JSON.stringify(f.record));
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"unavailable or ambiguous",
		);
	});

	test("rejects independent profile stores without copying a transcript", async () => {
		const f = await fixture();
		const alias = join(f.target.directory, "projects");
		await rm(alias);
		await mkdir(alias);
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"Shared conversation history",
		);
		expect(await readdir(alias)).toEqual([]);
	});

	test("rejects Codex profiles with separate native writer-lock directories", async () => {
		const f = await fixture("codex");
		const alias = join(f.target.directory, "thread-writer-locks");
		await rm(alias);
		await mkdir(alias);
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"Shared conversation history",
		);
	});

	test("rejects compressed Codex history alongside the uncompressed record", async () => {
		const f = await fixture("codex");
		await writeFile(`${f.file}.zst`, "synthetic compressed marker");
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"unavailable or ambiguous",
		);
	});

	test("rejects a nested transcript symlink instead of trusting an unchecked location", async () => {
		const f = await fixture();
		const other = join(f.root, "elsewhere.jsonl");
		await writeFile(other, JSON.stringify(f.record));
		await rm(f.file);
		await symlink(other, f.file);
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"unavailable or ambiguous",
		);
	});

	test("detects history growth between the initial check and launch", async () => {
		const f = await fixture();
		const before = await inspectAccountResumeHistory(f.input);
		await appendFile(f.file, `${JSON.stringify(f.record)}\n`);
		expect(
			sameAccountResumeHistory(
				before,
				await inspectAccountResumeHistory(f.input),
			),
		).toBe(false);
	});

	test("rejects traversal syntax in a saved native ID", async () => {
		const f = await fixture();
		await expect(
			inspectAccountResumeHistory({ ...f.input, sessionId: "../other" }),
		).rejects.toThrow("unavailable or ambiguous");
	});
	test.each([
		"foreign",
		"truncated",
		"worker",
	])("rejects a %s record after a matching initial message", async (kind) => {
		const f = await fixture();
		const suffix =
			kind === "truncated"
				? '{"type":'
				: JSON.stringify({
						...f.record,
						...(kind === "foreign"
							? { sessionId: "99999999-2222-3333-4444-555555555555" }
							: { isSidechain: true }),
					});
		await appendFile(f.file, `${suffix}\n`);
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"unavailable or ambiguous",
		);
	});
	test("ignores Claude session sidecars when finding the main transcript", async () => {
		const f = await fixture();
		const deep = join(f.shared, "project", id, "subagents");
		await mkdir(deep, { recursive: true });
		await writeFile(
			join(deep, `${id}.jsonl`),
			JSON.stringify({ ...f.record, isSidechain: true }),
		);
		expect((await inspectAccountResumeHistory(f.input)).path).toBe(
			await realpath(f.file),
		);
	});

	test("does not hide an ambiguous Codex copy in a deeper directory", async () => {
		const f = await fixture("codex");
		const deep = join(f.shared, "extra/nested/level");
		await mkdir(deep, { recursive: true });
		await writeFile(
			join(deep, `rollout-duplicate-${id}.jsonl`),
			JSON.stringify(f.record),
		);
		await expect(inspectAccountResumeHistory(f.input)).rejects.toThrow(
			"unavailable or ambiguous",
		);
	});
});

test("worker refusal retains the public precondition error without transcript details", async () => {
	const { file, input } = await fixture();
	await writeFile(file, "{private synthetic invalid content}\n");
	try {
		await inspectAccountResumeHistory(input);
		throw new Error("Expected refusal");
	} catch (error) {
		expect(error).toMatchObject({
			code: "PRECONDITION_FAILED",
			message:
				"The exact saved conversation is unavailable or ambiguous in the selected account. Shared conversation history is required. Nothing was launched.",
		});
	}
});
