import { describe, expect, it } from "bun:test";
import os from "node:os";
import { pickEnvValue } from "./procfs.ts";
import {
	parsePsEnvOutput,
	readTerminalIdsFromEnv,
	TERMINAL_ID_ENV_KEYS,
} from "./terminal-env.ts";

const TERMINAL = "df6750e5-5242-405c-8b9f-71564b916ace";

describe("pickEnvValue", () => {
	it("prefers keys in priority order", () => {
		expect(
			pickEnvValue(
				["SUPERSET_PANE_ID=pane", "SUPERSET_TERMINAL_ID=term"],
				TERMINAL_ID_ENV_KEYS,
			),
		).toBe("term");
	});

	it("falls back to the desktop's pane id", () => {
		expect(
			pickEnvValue(["FOO=bar", "SUPERSET_PANE_ID=pane"], TERMINAL_ID_ENV_KEYS),
		).toBe("pane");
	});

	it("ignores empty values and unrelated keys", () => {
		expect(
			pickEnvValue(
				["SUPERSET_TERMINAL_ID=", "SUPERSET_TERMINAL_ID_X=nope", "=weird"],
				TERMINAL_ID_ENV_KEYS,
			),
		).toBeNull();
	});
});

describe("parsePsEnvOutput", () => {
	it("maps each pid to the terminal id in its environment", () => {
		const output = [
			` 79737 bun run dev TERM=xterm-256color SUPERSET_WORKSPACE_ID=ws SUPERSET_TERMINAL_ID=${TERMINAL} HOME=/Users/x`,
			// A process that overwrote its argv area: ps shows only the title.
			" 80076 next-server (v16.2.11)",
			"    12 /sbin/launchd",
		].join("\n");
		const parsed = parsePsEnvOutput(output);
		expect(parsed.get(79737)).toBe(TERMINAL);
		expect(parsed.get(80076)).toBeNull();
		expect(parsed.get(12)).toBeNull();
		expect(parsed.size).toBe(3);
	});

	it("does not mistake a command argument for the variable", () => {
		// `env SUPERSET_TERMINAL_ID=x cmd` is semantically the same intent, so it
		// is accepted; a mere substring is not.
		const parsed = parsePsEnvOutput(
			" 1 grep --SUPERSET_TERMINAL_ID=abc file\n 2 env SUPERSET_TERMINAL_ID=abc node\n",
		);
		expect(parsed.get(1)).toBeNull();
		expect(parsed.get(2)).toBe("abc");
	});

	it("handles empty output", () => {
		expect(parsePsEnvOutput("").size).toBe(0);
	});
});

describe("readTerminalIdsFromEnv (real processes)", () => {
	const supported = os.platform() === "darwin" || os.platform() === "linux";

	it.skipIf(!supported)(
		"reads the id from a child spawned with it and null from one without",
		async () => {
			const spawn = (env: Record<string, string>) =>
				Bun.spawn([process.execPath, "-e", "setTimeout(() => {}, 5000)"], {
					env: { ...process.env, ...env },
				});
			// The test runner may itself be inside a Superset terminal, so clear
			// the inherited ids explicitly rather than relying on their absence.
			const withId = spawn({
				SUPERSET_TERMINAL_ID: TERMINAL,
				SUPERSET_PANE_ID: "",
			});
			const withPane = spawn({
				SUPERSET_TERMINAL_ID: "",
				SUPERSET_PANE_ID: "pane-1",
			});
			const without = spawn({ SUPERSET_TERMINAL_ID: "", SUPERSET_PANE_ID: "" });
			// A pid that existed and has exited: the realistic race between the
			// table read and the environment read. (An out-of-range pid is not
			// realistic — macOS `ps` rejects the whole batch for one.)
			const exited = Bun.spawn([process.execPath, "-e", ""]);
			await exited.exited;
			try {
				const ids = await readTerminalIdsFromEnv([
					withId.pid,
					withPane.pid,
					without.pid,
					exited.pid,
				]);
				expect(ids.get(withId.pid)).toBe(TERMINAL);
				expect(ids.get(withPane.pid)).toBe("pane-1");
				expect(ids.get(without.pid)).toBeNull();
				expect(ids.get(exited.pid)).toBeNull();
				expect(ids.size).toBe(4);
			} finally {
				withId.kill();
				withPane.kill();
				without.kill();
			}
		},
	);

	it("returns an empty map for no pids", async () => {
		expect((await readTerminalIdsFromEnv([])).size).toBe(0);
	});
});
