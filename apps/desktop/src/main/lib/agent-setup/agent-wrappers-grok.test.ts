import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	GROK_MANAGED_HOOK_EVENTS,
	getClaudeManagedHookCommand,
	getGrokHome,
	getGrokHooksJsonContent,
	getGrokHooksJsonPath,
	getGrokWrapperScript,
} from "./agent-wrappers";
import { createGrokHooksJson } from "./agent-wrappers-grok";
import {
	DESKTOP_AGENT_SETUP_TARGETS,
	SUPERSET_MANAGED_BINARIES,
} from "./desktop-agent-capabilities";

const TEST_ROOTS: string[] = [];

function createTestRoot(label: string): string {
	const root = mkdtempSync(path.join(os.tmpdir(), `superset-grok-${label}-`));
	TEST_ROOTS.push(root);
	return root;
}

afterEach(() => {
	for (const root of TEST_ROOTS.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("Grok hook configuration", () => {
	it("resolves GROK_HOME with a ~/.grok fallback", () => {
		const homeDir = "/Users/example";

		expect(getGrokHome({ env: {}, homeDir })).toBe(path.join(homeDir, ".grok"));
		expect(getGrokHome({ env: { GROK_HOME: "   " }, homeDir })).toBe(
			path.join(homeDir, ".grok"),
		);
		expect(
			getGrokHome({
				env: { GROK_HOME: "/tmp/custom grok home" },
				homeDir,
			}),
		).toBe("/tmp/custom grok home");
		expect(
			getGrokHooksJsonPath({
				env: { GROK_HOME: "/tmp/custom grok home" },
				homeDir,
			}),
		).toBe("/tmp/custom grok home/hooks/superset.json");
	});

	it("generates isolated passive hooks using Grok identity", () => {
		const content = getGrokHooksJsonContent();
		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					hooks: Array<{
						type: string;
						command: string;
						timeout: number;
					}>;
				}>
			>;
		};

		expect(Object.keys(parsed.hooks)).toEqual([...GROK_MANAGED_HOOK_EVENTS]);
		expect(parsed.hooks.PreToolUse).toBeUndefined();
		for (const definitions of Object.values(parsed.hooks)) {
			expect(definitions).toHaveLength(1);
			const hook = definitions[0]?.hooks[0];
			expect(hook?.type).toBe("command");
			expect(hook?.timeout).toBe(10);
			expect(hook?.command).toContain("SUPERSET_AGENT_ID=grok");
			expect(hook?.command).toContain("$SUPERSET_HOME_DIR/hooks/notify.sh");
		}
		expect(getGrokHooksJsonContent()).toBe(content);
	});

	it("replaces its malformed file and preserves sibling hooks", () => {
		const root = createTestRoot("config");
		const grokHome = path.join(root, "custom grok home");
		const hooksDir = path.join(grokHome, "hooks");
		const managedPath = path.join(hooksDir, "superset.json");
		const siblingPath = path.join(hooksDir, "user-hook.json");
		mkdirSync(hooksDir, { recursive: true });
		writeFileSync(managedPath, "{broken");
		writeFileSync(siblingPath, '{"user":true}');

		createGrokHooksJson({ env: { GROK_HOME: grokHome }, homeDir: root });

		expect(readFileSync(managedPath, "utf-8")).toBe(getGrokHooksJsonContent());
		expect(readFileSync(siblingPath, "utf-8")).toBe('{"user":true}');

		createGrokHooksJson({ env: { GROK_HOME: grokHome }, homeDir: root });
		expect(readFileSync(managedPath, "utf-8")).toBe(getGrokHooksJsonContent());
	});

	it("fails open when the configured home cannot contain hooks", () => {
		const root = createTestRoot("blocked");
		const blockedHome = path.join(root, "not-a-directory");
		writeFileSync(blockedHome, "occupied");

		expect(() =>
			createGrokHooksJson({
				env: { GROK_HOME: blockedHome },
				homeDir: root,
			}),
		).not.toThrow();
	});
});

describe("Grok wrapper", () => {
	it("refreshes the runtime GROK_HOME and launches the real binary", () => {
		const root = createTestRoot("wrapper");
		const realBinDir = path.join(root, "real-bin");
		const realGrok = path.join(realBinDir, "grok");
		const wrapperPath = path.join(root, "managed-grok");
		const runtimeHome = path.join(root, "runtime grok home");
		const invocationLog = path.join(root, "invocation.log");
		mkdirSync(realBinDir, { recursive: true });
		writeFileSync(
			realGrok,
			'#!/bin/bash\nprintf "agent=%s\\n" "$SUPERSET_AGENT_ID" > "$INVOCATION_LOG"\nprintf "arg=%s\\n" "$@" >> "$INVOCATION_LOG"\n',
			{ mode: 0o755 },
		);
		writeFileSync(wrapperPath, getGrokWrapperScript(), { mode: 0o755 });
		chmodSync(realGrok, 0o755);
		chmodSync(wrapperPath, 0o755);

		execFileSync(wrapperPath, ["hello world", "--effort", "high"], {
			env: {
				...process.env,
				GROK_HOME: runtimeHome,
				INVOCATION_LOG: invocationLog,
				PATH: `${realBinDir}:${process.env.PATH ?? ""}`,
			},
		});

		expect(
			readFileSync(path.join(runtimeHome, "hooks", "superset.json"), "utf-8"),
		).toBe(getGrokHooksJsonContent());
		expect(readFileSync(invocationLog, "utf-8")).toBe(
			"agent=grok\narg=hello world\narg=--effort\narg=high\n",
		);
	});

	it("still launches Grok when runtime hook installation fails", () => {
		const root = createTestRoot("wrapper-fail-open");
		const realBinDir = path.join(root, "real-bin");
		const realGrok = path.join(realBinDir, "grok");
		const wrapperPath = path.join(root, "managed-grok");
		const blockedHome = path.join(root, "not-a-directory");
		const invocationLog = path.join(root, "invocation.log");
		mkdirSync(realBinDir, { recursive: true });
		writeFileSync(blockedHome, "occupied");
		writeFileSync(
			realGrok,
			'#!/bin/bash\nprintf launched > "$INVOCATION_LOG"\n',
			{
				mode: 0o755,
			},
		);
		writeFileSync(wrapperPath, getGrokWrapperScript(), { mode: 0o755 });
		chmodSync(wrapperPath, 0o755);

		execFileSync(wrapperPath, [], {
			env: {
				...process.env,
				GROK_HOME: blockedHome,
				INVOCATION_LOG: invocationLog,
				PATH: `${realBinDir}:${process.env.PATH ?? ""}`,
			},
		});

		expect(readFileSync(invocationLog, "utf-8")).toBe("launched");
		expect(existsSync(path.join(blockedHome, "hooks"))).toBe(false);
	});
});

describe("Grok and Claude hook coexistence", () => {
	it("skips only the managed Claude hook for Grok-originated events", () => {
		const root = createTestRoot("claude-guard");
		const hooksDir = path.join(root, "hooks");
		const notifyPath = path.join(hooksDir, "notify.sh");
		const invocationLog = path.join(root, "invocation.log");
		mkdirSync(hooksDir, { recursive: true });
		writeFileSync(
			notifyPath,
			'#!/bin/bash\nprintf "%s\\n" "$SUPERSET_AGENT_ID" >> "$INVOCATION_LOG"\n',
			{ mode: 0o755 },
		);

		const command = getClaudeManagedHookCommand();
		execFileSync("/bin/bash", ["-c", command], {
			env: {
				...process.env,
				SUPERSET_HOME_DIR: root,
				INVOCATION_LOG: invocationLog,
			},
		});
		execFileSync("/bin/bash", ["-c", command], {
			env: {
				...process.env,
				GROK_HOOK_EVENT: "user_prompt_submit",
				SUPERSET_HOME_DIR: root,
				INVOCATION_LOG: invocationLog,
			},
		});

		expect(readFileSync(invocationLog, "utf-8")).toBe("claude\n");
	});
});

describe("Grok desktop setup registration", () => {
	it("installs native hooks through the managed Grok binary", () => {
		const target = DESKTOP_AGENT_SETUP_TARGETS.find(
			(candidate) => candidate.id === "grok",
		);

		expect(target?.setupActions).toEqual(["grok-hooks-json", "grok-wrapper"]);
		expect(SUPERSET_MANAGED_BINARIES).toContain("grok");
	});
});
