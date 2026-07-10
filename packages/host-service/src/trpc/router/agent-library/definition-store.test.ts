import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFsHostService } from "@superset/workspace-fs/host";
import {
	createDefinition,
	DefinitionStoreError,
	getDefinition,
	listDefinitions,
	removeDefinition,
	saveDefinition,
	type ScopeRoot,
	transferDefinition,
} from "./definition-store";

const WORKER = `---
name: worker
description: Implements one ticket end-to-end
model: sonnet
memory: project
---

You are a worker agent.
`;

const SKILL = `---
name: orchestrate
description: Turn the main chat into an orchestrator
---

# Orchestrate

Do the thing.
`;

let userDir: string;
let projectDir: string;

function userRoot(): ScopeRoot {
	return {
		scopeKey: "user",
		rootPath: userDir,
		fs: createFsHostService({ rootPath: userDir }),
		agentDirs: ["agents"],
		skillDirs: ["skills"],
	};
}

function projectRoot(): ScopeRoot {
	return {
		scopeKey: "project:p1",
		rootPath: projectDir,
		fs: createFsHostService({ rootPath: projectDir }),
		agentDirs: [".claude/agents", ".agents/agents"],
		skillDirs: [".claude/skills", ".agents/skills"],
	};
}

beforeEach(async () => {
	// realpath: macOS tmpdir sits behind a /var -> /private/var symlink, but
	// scope roots must be canonical paths (as project repoPaths are in prod).
	userDir = await realpath(await mkdtemp(join(tmpdir(), "agent-lib-user-")));
	projectDir = await realpath(
		await mkdtemp(join(tmpdir(), "agent-lib-project-")),
	);

	await mkdir(join(userDir, "agents"), { recursive: true });
	await writeFile(join(userDir, "agents", "worker.md"), WORKER);
	await mkdir(join(userDir, "skills", "orchestrate"), { recursive: true });
	await writeFile(join(userDir, "skills", "orchestrate", "SKILL.md"), SKILL);
	await writeFile(
		join(userDir, "skills", "orchestrate", "reference.txt"),
		"asset\n",
	);

	// Project mirrors this repo's convention: real dir is .agents/skills,
	// .claude/skills is a symlink to it.
	await mkdir(join(projectDir, ".agents", "skills", "ticket-format"), {
		recursive: true,
	});
	await writeFile(
		join(projectDir, ".agents", "skills", "ticket-format", "SKILL.md"),
		"---\ndescription: Ticket format\n---\nBody\n",
	);
	await mkdir(join(projectDir, ".claude"), { recursive: true });
	await symlink(
		join(projectDir, ".agents", "skills"),
		join(projectDir, ".claude", "skills"),
	);
});

afterEach(async () => {
	await rm(userDir, { recursive: true, force: true });
	await rm(projectDir, { recursive: true, force: true });
});

describe("listDefinitions", () => {
	it("lists agents and skills with frontmatter fields", async () => {
		const items = await listDefinitions(userRoot());
		expect(items.map((i) => `${i.kind}:${i.name}`).sort()).toEqual([
			"agent:worker",
			"skill:orchestrate",
		]);
		const worker = items.find((i) => i.kind === "agent");
		expect(worker?.model).toBe("sonnet");
		expect(worker?.description).toBe("Implements one ticket end-to-end");
		expect(worker?.relativePath).toBe("agents/worker.md");
	});

	it("lists a symlinked skills dir exactly once", async () => {
		const items = await listDefinitions(projectRoot());
		expect(items).toHaveLength(1);
		expect(items[0]?.name).toBe("ticket-format");
	});

	it("returns empty for a scope with no config dirs", async () => {
		const emptyDir = await mkdtemp(join(tmpdir(), "agent-lib-empty-"));
		try {
			const items = await listDefinitions({
				...userRoot(),
				rootPath: emptyDir,
				fs: createFsHostService({ rootPath: emptyDir }),
			});
			expect(items).toEqual([]);
		} finally {
			await rm(emptyDir, { recursive: true, force: true });
		}
	});
});

describe("getDefinition / saveDefinition", () => {
	it("round-trips a model change without touching other lines", async () => {
		const root = userRoot();
		const detail = await getDefinition(root, "agent", "worker");
		expect(detail.model).toBe("sonnet");

		await saveDefinition(root, {
			kind: "agent",
			name: "worker",
			patch: { model: "opus" },
			expectedRevision: detail.revision,
		});

		const after = await readFile(join(userDir, "agents", "worker.md"), "utf8");
		expect(after).toBe(WORKER.replace("model: sonnet", "model: opus"));
	});

	it("rejects a save with a stale revision", async () => {
		const root = userRoot();
		const detail = await getDefinition(root, "agent", "worker");
		await writeFile(
			join(userDir, "agents", "worker.md"),
			WORKER.replace("sonnet", "haiku"),
		);

		await expect(
			saveDefinition(root, {
				kind: "agent",
				name: "worker",
				patch: { model: "opus" },
				expectedRevision: detail.revision,
			}),
		).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
	});

	it("saves raw content", async () => {
		const root = userRoot();
		const detail = await getDefinition(root, "skill", "orchestrate");
		await saveDefinition(root, {
			kind: "skill",
			name: "orchestrate",
			raw: "---\ndescription: rewritten\n---\nNew.\n",
			expectedRevision: detail.revision,
		});
		const after = await getDefinition(root, "skill", "orchestrate");
		expect(after.description).toBe("rewritten");
		expect(after.body).toBe("New.\n");
	});

	it("throws NOT_FOUND for a missing definition", async () => {
		await expect(
			getDefinition(userRoot(), "agent", "nope"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("createDefinition / removeDefinition", () => {
	it("creates an agent file and a skill folder", async () => {
		const root = userRoot();
		await createDefinition(root, {
			kind: "agent",
			name: "reviewer",
			description: "Reviews PRs",
		});
		await createDefinition(root, {
			kind: "skill",
			name: "deploy",
			description: "Deploys",
		});

		const items = await listDefinitions(root);
		expect(items.map((i) => i.name).sort()).toEqual([
			"deploy",
			"orchestrate",
			"reviewer",
			"worker",
		]);
	});

	it("refuses to create over an existing definition", async () => {
		await expect(
			createDefinition(userRoot(), {
				kind: "agent",
				name: "worker",
				description: "dup",
			}),
		).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
	});

	it("removes a skill folder recursively", async () => {
		const root = userRoot();
		await removeDefinition(root, { kind: "skill", name: "orchestrate" });
		expect(await listDefinitions(root)).toHaveLength(1);
	});
});

describe("transferDefinition", () => {
	it("copies an agent across scopes", async () => {
		await transferDefinition({
			source: userRoot(),
			target: projectRoot(),
			kind: "agent",
			name: "worker",
			mode: "copy",
			overwrite: false,
		});

		const copied = await getDefinition(projectRoot(), "agent", "worker");
		expect(copied.raw).toBe(WORKER);
		expect(copied.relativePath).toBe(".claude/agents/worker.md");
		// Source untouched on copy.
		await getDefinition(userRoot(), "agent", "worker");
	});

	it("moves a skill folder with its assets", async () => {
		await transferDefinition({
			source: userRoot(),
			target: projectRoot(),
			kind: "skill",
			name: "orchestrate",
			mode: "move",
			overwrite: false,
		});

		await expect(
			getDefinition(userRoot(), "skill", "orchestrate"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const asset = await readFile(
			join(projectDir, ".agents", "skills", "orchestrate", "reference.txt"),
			"utf8",
		);
		expect(asset).toBe("asset\n");
	});

	it("refuses to overwrite without the flag, replaces cleanly with it", async () => {
		const target = projectRoot();
		await transferDefinition({
			source: userRoot(),
			target,
			kind: "skill",
			name: "orchestrate",
			mode: "copy",
			overwrite: false,
		});

		await expect(
			transferDefinition({
				source: userRoot(),
				target,
				kind: "skill",
				name: "orchestrate",
				mode: "copy",
				overwrite: false,
			}),
		).rejects.toMatchObject({ code: "ALREADY_EXISTS" });

		// Stale assets in the target must not survive an overwrite.
		await writeFile(
			join(projectDir, ".agents", "skills", "orchestrate", "stale.txt"),
			"old\n",
		);
		await transferDefinition({
			source: userRoot(),
			target,
			kind: "skill",
			name: "orchestrate",
			mode: "copy",
			overwrite: true,
		});
		await expect(
			readFile(
				join(projectDir, ".agents", "skills", "orchestrate", "stale.txt"),
				"utf8",
			),
		).rejects.toThrow();
	});

	it("rejects a transfer within the same scope", async () => {
		await expect(
			transferDefinition({
				source: userRoot(),
				target: userRoot(),
				kind: "agent",
				name: "worker",
				mode: "copy",
				overwrite: false,
			}),
		).rejects.toBeInstanceOf(DefinitionStoreError);
	});
});
