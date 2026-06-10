import { spawnSync } from "node:child_process";

const WINDOWS_PROCESS_COMMAND_LINE_QUERY = (pid: number) =>
	`$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -ne $p) { $p.CommandLine }`;

export function buildWindowsProcessCommandLineCommand(pid: number): {
	command: string;
	args: string[];
} {
	if (!Number.isInteger(pid) || pid <= 0) {
		throw new RangeError(`invalid pid: ${pid}`);
	}

	return {
		command: "powershell.exe",
		args: [
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			WINDOWS_PROCESS_COMMAND_LINE_QUERY(pid),
		],
	};
}

export function isTerminalHostDaemonCommandLine(
	commandLine: string,
	daemonScript: string,
): boolean {
	const trimmed = commandLine.trim();
	if (!trimmed) return false;
	return trimmed.includes(daemonScript) || trimmed.includes("terminal-host");
}

export function readProcessCommandLine(
	pid: number,
	options: {
		platform?: NodeJS.Platform;
		spawn?: typeof spawnSync;
	} = {},
): string | null {
	if (!Number.isInteger(pid) || pid <= 0) return null;

	const platform = options.platform ?? process.platform;
	const spawn = options.spawn ?? spawnSync;
	const windowsCommand =
		platform === "win32" ? buildWindowsProcessCommandLineCommand(pid) : null;
	const result = windowsCommand
		? spawn(windowsCommand.command, windowsCommand.args, {
				encoding: "utf8",
				windowsHide: true,
			})
		: spawn("ps", ["-p", String(pid), "-o", "command="], {
				encoding: "utf8",
			});

	if (result.error || result.status !== 0) return null;
	return result.stdout.trim() || null;
}
