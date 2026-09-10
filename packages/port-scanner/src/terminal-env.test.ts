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
		const parsed = parsePsEnvOutput(
			output,
			" 79737 bun run dev\n 80076 next-server (v16.2.11)\n 12 /sbin/launchd",
		);
		expect(parsed.get(79737)).toBe(TERMINAL);
		expect(parsed.get(80076)).toBeNull();
		expect(parsed.get(12)).toBeNull();
		expect(parsed.size).toBe(3);
	});

	it("does not mistake a command argument for the variable", () => {
		const commands =
			" 1 grep --SUPERSET_TERMINAL_ID=abc file\n 2 node app.js SUPERSET_TERMINAL_ID=abc\n";
		const parsed = parsePsEnvOutput(commands, commands);
		expect(parsed.get(1)).toBeNull();
		expect(parsed.get(2)).toBeNull();
	});

	it("uses the real environment even when argv mentions a different terminal", () => {
		expect(
			parsePsEnvOutput(
				" 1 node app.js SUPERSET_TERMINAL_ID=fake SUPERSET_TERMINAL_ID=real",
				" 1 node app.js SUPERSET_TERMINAL_ID=fake",
			).get(1),
		).toBe("real");
	});

	it("fails closed when the command changes or was not observed", () => {
		const parsed = parsePsEnvOutput(
			" 1 new-command SUPERSET_TERMINAL_ID=term\n 2 node SUPERSET_TERMINAL_ID=term",
			" 1 old-command",
		);
		expect(parsed.get(1)).toBeNull();
		expect(parsed.get(2)).toBeNull();
	});

	it("handles empty output", () => {
		expect(parsePsEnvOutput("", "").size).toBe(0);
	});
});

describe("readTerminalIdsFromEnv (real processes)", () => {
	const supported = os.platform() === "darwin" || os.platform() === "linux";

	it.skipIf(os.platform() !== "darwin")(
		"propagates a failed ps snapshot instead of returning null owners",
		async () => {
			const previousPath = process.env.PATH;
			try {
				process.env.PATH = "/nonexistent-superset-test-bin";
				await expect(readTerminalIdsFromEnv([process.pid])).rejects.toThrow();
			} finally {
				if (previousPath === undefined) delete process.env.PATH;
				else process.env.PATH = previousPath;
			}
		},
	);

	it.skipIf(!supported)(
		"ignores an argument-only ID in both targeted and whole-table reads",
		async () => {
			const fake = Bun.spawn(
				[
					process.execPath,
					"-e",
					"setTimeout(() => {}, 10000)",
					`SUPERSET_TERMINAL_ID=${TERMINAL}`,
				],
				{
					env: { SUPERSET_TERMINAL_ID: "", SUPERSET_PANE_ID: "" },
					stdout: "ignore",
					stderr: "ignore",
				},
			);
			const real = Bun.spawn(
				[
					process.execPath,
					"-e",
					"setTimeout(() => {}, 10000)",
					"SUPERSET_TERMINAL_ID=argument-only",
				],
				{
					env: { SUPERSET_TERMINAL_ID: TERMINAL, SUPERSET_PANE_ID: "" },
					stdout: "ignore",
					stderr: "ignore",
				},
			);
			try {
				for (const pids of [
					[fake.pid, real.pid],
					[...Array<number>(201).fill(fake.pid), real.pid],
				]) {
					const ids = await readTerminalIdsFromEnv(pids);
					expect(ids.get(fake.pid)).toBeNull();
					expect(ids.get(real.pid)).toBe(TERMINAL);
				}
			} finally {
				fake.kill();
				real.kill();
				await Promise.all([fake.exited, real.exited]);
			}
		},
	);

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
