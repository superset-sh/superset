import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCursorAgentExecBlock } from "./agent-wrappers-cursor";

/**
 * cursor-agent takes a kitty-only code path when TERM_PROGRAM claims kitty
 * and then blocks forever on a capability answer an xterm.js pane never
 * sends (GH #7600). The wrapper strips the impersonated identity before
 * exec; these tests run the actual shell block so the guard is proven, not
 * just string-matched.
 */
describe("cursor-agent wrapper terminal identity", () => {
	function runExecBlock(env: Record<string, string>): string {
		const dir = mkdtempSync(join(tmpdir(), "cursor-wrapper-"));
		try {
			const probe = join(dir, "probe.sh");
			writeFileSync(
				probe,
				// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a JS template
				'#!/bin/bash\necho "TERM_PROGRAM=${TERM_PROGRAM-unset}"\necho "TERM_PROGRAM_VERSION=${TERM_PROGRAM_VERSION-unset}"\n',
			);
			chmodSync(probe, 0o755);
			const script = join(dir, "wrapper.sh");
			writeFileSync(
				script,
				`#!/bin/bash\nREAL_BIN="${probe}"\n${buildCursorAgentExecBlock()}`,
			);
			chmodSync(script, 0o755);
			return execFileSync(script, {
				encoding: "utf8",
				env: { PATH: process.env.PATH ?? "", ...env },
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}

	test("strips the impersonated kitty identity", () => {
		const out = runExecBlock({
			TERM_PROGRAM: "kitty",
			TERM_PROGRAM_VERSION: "0.42.0",
		});
		expect(out).toContain("TERM_PROGRAM=unset");
		expect(out).toContain("TERM_PROGRAM_VERSION=unset");
	});

	test("keeps a real kitty terminal's identity", () => {
		const out = runExecBlock({
			TERM_PROGRAM: "kitty",
			TERM_PROGRAM_VERSION: "0.42.0",
			KITTY_PID: "12345",
		});
		expect(out).toContain("TERM_PROGRAM=kitty");
		expect(out).toContain("TERM_PROGRAM_VERSION=0.42.0");
	});

	test("leaves every other terminal identity alone", () => {
		const out = runExecBlock({ TERM_PROGRAM: "iTerm.app" });
		expect(out).toContain("TERM_PROGRAM=iTerm.app");
	});

	test("passes arguments through on both paths", () => {
		const dir = mkdtempSync(join(tmpdir(), "cursor-wrapper-args-"));
		try {
			const probe = join(dir, "probe.sh");
			writeFileSync(probe, '#!/bin/bash\necho "args:$*"\n');
			chmodSync(probe, 0o755);
			const script = join(dir, "wrapper.sh");
			writeFileSync(
				script,
				`#!/bin/bash\nREAL_BIN="${probe}"\n${buildCursorAgentExecBlock()}`,
			);
			chmodSync(script, 0o755);
			for (const env of [{ TERM_PROGRAM: "kitty" }, {}]) {
				const out = execFileSync(script, ["-p", "hello world"], {
					encoding: "utf8",
					env: { PATH: process.env.PATH ?? "", ...env },
				});
				expect(out).toContain("args:-p hello world");
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
