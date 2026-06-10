import { describe, expect, mock, test } from "bun:test";
import type { spawnSync } from "node:child_process";
import {
	buildWindowsProcessCommandLineCommand,
	isTerminalHostDaemonCommandLine,
	readProcessCommandLine,
} from "./process-command-line";

function spawnResult(stdout: string, status = 0): ReturnType<typeof spawnSync> {
	return {
		error: undefined,
		output: [null, stdout, ""],
		pid: 123,
		signal: null,
		status,
		stderr: "",
		stdout,
	} as ReturnType<typeof spawnSync>;
}

describe("buildWindowsProcessCommandLineCommand", () => {
	test("uses powershell argv instead of a shell command string", () => {
		const command = buildWindowsProcessCommandLineCommand(4321);

		expect(command.command).toBe("powershell.exe");
		expect(command.args).toContain("-NonInteractive");
		expect(command.args).toContain("-Command");
		expect(command.args.join(" ")).toContain("ProcessId = 4321");
		expect(command.args[0]).not.toContain("powershell");
	});

	test("rejects invalid pids", () => {
		expect(() => buildWindowsProcessCommandLineCommand(0)).toThrow(RangeError);
		expect(() => buildWindowsProcessCommandLineCommand(-1)).toThrow(RangeError);
	});
});

describe("readProcessCommandLine", () => {
	test("queries Windows command lines with powershell argv", () => {
		const spawn = mock(() =>
			spawnResult("node C:\\\\app\\\\terminal-host.js\r\n"),
		) as unknown as typeof spawnSync;

		const commandLine = readProcessCommandLine(1234, {
			platform: "win32",
			spawn,
		});

		expect(commandLine).toBe("node C:\\\\app\\\\terminal-host.js");
		expect(spawn).toHaveBeenCalledWith(
			"powershell.exe",
			expect.arrayContaining(["-NonInteractive", "-Command"]),
			expect.objectContaining({ encoding: "utf8", windowsHide: true }),
		);
	});

	test("queries Unix command lines with ps", () => {
		const spawn = mock(() =>
			spawnResult("node /tmp/terminal-host.js\n"),
		) as unknown as typeof spawnSync;

		const commandLine = readProcessCommandLine(1234, {
			platform: "linux",
			spawn,
		});

		expect(commandLine).toBe("node /tmp/terminal-host.js");
		expect(spawn).toHaveBeenCalledWith(
			"ps",
			["-p", "1234", "-o", "command="],
			expect.objectContaining({ encoding: "utf8" }),
		);
	});

	test("returns null for failed probes and invalid pids", () => {
		const spawn = mock(() => spawnResult("", 1)) as unknown as typeof spawnSync;

		expect(readProcessCommandLine(1234, { platform: "win32", spawn })).toBe(
			null,
		);
		expect(readProcessCommandLine(0, { platform: "win32", spawn })).toBe(null);
	});
});

describe("isTerminalHostDaemonCommandLine", () => {
	test("matches the daemon script path", () => {
		expect(
			isTerminalHostDaemonCommandLine(
				"node C:\\\\app\\\\terminal-host.js",
				"C:\\\\app\\\\terminal-host.js",
			),
		).toBe(true);
	});

	test("matches terminal-host executable names", () => {
		expect(
			isTerminalHostDaemonCommandLine("terminal-host.exe --stdio", "missing"),
		).toBe(true);
	});

	test("rejects unrelated live process command lines", () => {
		expect(
			isTerminalHostDaemonCommandLine("notepad.exe", "terminal-host.js"),
		).toBe(false);
	});
});
