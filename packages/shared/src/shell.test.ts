import { describe, expect, test } from "bun:test";
import {
	appendShellLineEnding,
	buildShellChangeDirectoryCommand,
	buildShellCommandChain,
	getKnownShell,
	getShellLineEnding,
	getShellName,
	getWindowsCommandShellArgs,
	getWindowsInteractiveShellArgs,
	shellSupportsReadyMarker,
} from "./shell";

describe("shell helpers", () => {
	test("normalizes POSIX and Windows shell basenames", () => {
		expect(getShellName("/bin/bash")).toBe("bash");
		expect(getShellName("/opt/homebrew/bin/fish")).toBe("fish");
		expect(getShellName(String.raw`C:\Windows\System32\cmd.exe`)).toBe("cmd");
		expect(
			getShellName(String.raw`C:\Program Files\PowerShell\7\pwsh.exe`),
		).toBe("pwsh");
		expect(getShellName(String.raw`C:\Program Files\Git\bin\bash.exe`)).toBe(
			"bash",
		);
	});

	test("classifies known shells", () => {
		expect(
			getKnownShell(
				String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
			),
		).toBe("powershell");
		expect(getKnownShell("/usr/bin/zsh")).toBe("zsh");
		expect(getKnownShell("/usr/bin/nu")).toBe("unknown");
	});

	test("ready markers are only expected for wrapped POSIX shells", () => {
		expect(shellSupportsReadyMarker("/bin/bash")).toBe(true);
		expect(
			shellSupportsReadyMarker(String.raw`C:\Program Files\Git\bin\bash.exe`),
		).toBe(true);
		expect(shellSupportsReadyMarker("cmd.exe")).toBe(false);
		expect(shellSupportsReadyMarker("pwsh.exe")).toBe(false);
	});

	test("returns Windows interactive shell args", () => {
		expect(getWindowsInteractiveShellArgs("cmd.exe")).toEqual([]);
		expect(getWindowsInteractiveShellArgs("powershell.exe")).toEqual([
			"-NoLogo",
		]);
		expect(getWindowsInteractiveShellArgs("pwsh.exe")).toEqual(["-NoLogo"]);
		expect(getWindowsInteractiveShellArgs("/bin/bash")).toBeNull();
	});

	test("returns Windows command shell args", () => {
		expect(getWindowsCommandShellArgs("cmd.exe", "echo ok")).toEqual([
			"/d",
			"/s",
			"/c",
			"echo ok",
		]);
		expect(getWindowsCommandShellArgs("pwsh.exe", "Write-Output ok")).toEqual([
			"-NoLogo",
			"-NoProfile",
			"-Command",
			"Write-Output ok",
		]);
		expect(getWindowsCommandShellArgs("/bin/zsh", "echo ok")).toBeNull();
	});

	test("builds interactive command chains for PowerShell without &&", () => {
		expect(
			buildShellCommandChain(["echo one", "echo two", "echo three"], {
				platform: "win32",
				shell: "powershell.exe",
			}),
		).toBe("echo one; if ($?) { echo two }; if ($?) { echo three }");
	});

	test("builds exit-on-failure command chains for PowerShell setup commands", () => {
		const command = buildShellCommandChain(["echo one", "echo two"], {
			platform: "win32",
			shell: "pwsh.exe",
			mode: "exit-on-failure",
		});

		expect(command).not.toContain(" && ");
		expect(command).toContain("if (-not $?)");
		expect(command).toContain("exit $LASTEXITCODE");
	});

	test("keeps cmd and POSIX command chains compatible with &&", () => {
		expect(
			buildShellCommandChain(["echo one", "echo two"], {
				platform: "win32",
				shell: "cmd.exe",
			}),
		).toBe("echo one && echo two");
		expect(
			buildShellCommandChain(["echo one", "echo two"], {
				platform: "linux",
				shell: "/bin/bash",
			}),
		).toBe("echo one && echo two");
	});

	test("builds shell-specific change-directory commands", () => {
		expect(
			buildShellChangeDirectoryCommand(
				String.raw`C:\Users\Diego Garcia\repo's app`,
				"powershell.exe",
			),
		).toBe(
			String.raw`Set-Location -LiteralPath 'C:\Users\Diego Garcia\repo''s app'`,
		);
		expect(
			buildShellChangeDirectoryCommand(
				String.raw`C:\Users\Diego Garcia\repo`,
				"cmd.exe",
			),
		).toBe(String.raw`cd /d "C:\Users\Diego Garcia\repo"`);
		expect(
			buildShellChangeDirectoryCommand("/tmp/one's repo", "/bin/bash"),
		).toBe(`cd '/tmp/one'"'"'s repo'`);
	});

	test("uses CRLF command endings for native Windows shells", () => {
		expect(getShellLineEnding("cmd.exe")).toBe("\r\n");
		expect(getShellLineEnding("pwsh.exe")).toBe("\r\n");
		expect(getShellLineEnding("/bin/bash")).toBe("\n");
		expect(appendShellLineEnding("echo ok", "powershell.exe")).toBe(
			"echo ok\r\n",
		);
		expect(appendShellLineEnding("echo ok\n", "powershell.exe")).toBe(
			"echo ok\n",
		);
	});
});
