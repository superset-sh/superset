import { type ChildProcess, spawn } from "node:child_process";

const SHELL_ENV_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;
const DELIMITER = "__SUPERSET_SHELL_ENV__";

const SHELL_BOOTSTRAP_KEYS = [
	"HOME",
	"USER",
	"LOGNAME",
	"SHELL",
	"PATH",
	"TERM",
	"TMPDIR",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"__CF_USER_TEXT_ENCODING",
	"Apple_PubSub_Socket_Render",
	"COMSPEC",
	"USERPROFILE",
	"SYSTEMROOT",
];

const COMMON_MACOS_PATHS = [
	"/opt/homebrew/bin",
	"/opt/homebrew/sbin",
	"/usr/local/bin",
	"/usr/local/sbin",
];

function augmentPathForMacOS(
	env: Record<string, string>,
	platform: NodeJS.Platform = process.platform,
): void {
	if (platform !== "darwin") return;

	const currentPath = env.PATH ?? "";
	const currentEntries = currentPath.split(":").filter(Boolean);
	const pathEntries = new Set(currentEntries);
	const missingPaths = COMMON_MACOS_PATHS.filter(
		(path) => !pathEntries.has(path),
	);
	env.PATH = [...missingPaths, currentPath].filter(Boolean).join(":");
}

function buildMinimalEnv(): Record<string, string> {
	const env: Record<string, string> = {
		DISABLE_AUTO_UPDATE: "true",
		ZSH_TMUX_AUTOSTARTED: "true",
		ZSH_TMUX_AUTOSTART: "false",
	};

	for (const key of SHELL_BOOTSTRAP_KEYS) {
		const value = process.env[key];
		if (value) env[key] = value;
	}

	augmentPathForMacOS(env);
	return env;
}

function resolveShellForEnv(): string {
	if (process.platform === "win32") {
		return process.env.COMSPEC || "cmd.exe";
	}
	return process.env.SHELL || "/bin/sh";
}

function parseEnvOutput(stdout: string): Record<string, string> {
	const envSection = stdout.split(DELIMITER)[1];
	if (!envSection) {
		throw new Error("Failed to parse shell env output - delimiter not found");
	}

	const result: Record<string, string> = {};
	for (const line of envSection.split("\n").filter(Boolean)) {
		const idx = line.indexOf("=");
		if (idx > 0) {
			result[line.slice(0, idx)] = line.slice(idx + 1);
		}
	}

	if (Object.keys(result).length === 0) {
		throw new Error(
			"Shell env resolution returned empty - shell may have failed to start",
		);
	}

	return result;
}

function spawnCleanShellEnv(): Promise<Record<string, string>> {
	return new Promise((resolve, reject) => {
		const shell = resolveShellForEnv();
		const env = buildMinimalEnv();
		const command = `echo -n "${DELIMITER}"; command env; echo -n "${DELIMITER}"; exit`;

		let child: ChildProcess;
		try {
			child = spawn(shell, ["-i", "-l", "-c", command], {
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
				env,
			});
		} catch (error) {
			return reject(
				new Error(
					`Failed to spawn shell ${shell}: ${error instanceof Error ? error.message : error}`,
				),
			);
		}

		const stdoutBuffers: Buffer[] = [];
		const stderrBuffers: Buffer[] = [];

		child.stdout?.on("data", (data: Buffer) => stdoutBuffers.push(data));
		child.stderr?.on("data", (data: Buffer) => stderrBuffers.push(data));

		const timeout = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {
				// Already exited.
			}

			reject(
				new Error(
					`Shell env resolution timed out after ${SHELL_ENV_TIMEOUT_MS}ms`,
				),
			);
		}, SHELL_ENV_TIMEOUT_MS);

		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(new Error(`Shell process error for ${shell}: ${error.message}`));
		});

		child.on("close", (code, signal) => {
			clearTimeout(timeout);

			const stderr = Buffer.concat(stderrBuffers).toString("utf8").trim();
			if (stderr) {
				console.debug("[terminal-clean-shell-env] stderr:", stderr);
			}

			if (code !== 0 && code !== null) {
				return reject(
					new Error(
						`Shell ${shell} exited with code ${code}${signal ? `, signal ${signal}` : ""}`,
					),
				);
			}

			try {
				resolve(parseEnvOutput(Buffer.concat(stdoutBuffers).toString("utf8")));
			} catch (error) {
				reject(error);
			}
		});

		child.unref();
	});
}

let cache: Record<string, string> | null = null;
let cacheTime = 0;

export async function getStrictShellEnvironment(): Promise<
	Record<string, string>
> {
	if (cache && Date.now() - cacheTime < CACHE_TTL_MS) {
		return { ...cache };
	}

	const env = await spawnCleanShellEnv();
	cache = env;
	cacheTime = Date.now();
	return { ...cache };
}

export function clearStrictShellEnvCache(): void {
	cache = null;
	cacheTime = 0;
}
