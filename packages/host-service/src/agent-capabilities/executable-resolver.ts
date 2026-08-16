import { constants } from "node:fs";
import { access, open } from "node:fs/promises";
import {
	extname,
	isAbsolute,
	join,
	resolve,
	delimiter as systemPathDelimiter,
} from "node:path";
import { WRAPPER_MARKER } from "@superset/agent-setup";

export type AgentExecutableSource = "explicit" | "path" | "wrapper";

export interface ResolvedAgentExecutable {
	path: string;
	source: AgentExecutableSource;
}

interface ResolveAgentExecutableOptions {
	pathDelimiter?: string;
	platform?: NodeJS.Platform;
}

function executableNames(
	command: string,
	env: NodeJS.ProcessEnv,
	platform: NodeJS.Platform,
): string[] {
	if (platform !== "win32" || extname(command) !== "") return [command];
	const extensions = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
		.split(";")
		.filter(Boolean);
	return [command, ...extensions.map((extension) => `${command}${extension}`)];
}

async function isExecutable(path: string): Promise<boolean> {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function isSupersetManagedWrapper(path: string): Promise<boolean> {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(path, "r");
		const buffer = Buffer.alloc(512);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		return buffer.toString("utf8", 0, bytesRead).includes(WRAPPER_MARKER);
	} catch {
		return false;
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

function isPackageManagerBin(path: string): boolean {
	return /[\\/]node_modules[\\/]\.bin[\\/]/.test(path);
}

export async function resolveAgentExecutable(
	command: string,
	env: NodeJS.ProcessEnv,
	options: ResolveAgentExecutableOptions = {},
): Promise<ResolvedAgentExecutable | null> {
	const platform = options.platform ?? process.platform;
	const pathDelimiter = options.pathDelimiter ?? systemPathDelimiter;
	const explicit =
		isAbsolute(command) || command.includes("/") || command.includes("\\");
	const names = executableNames(command, env, platform);
	const candidates = explicit
		? names.map((name) => resolve(name))
		: (env.PATH ?? "")
				.split(pathDelimiter)
				.filter(Boolean)
				.flatMap((directory) => names.map((name) => join(directory, name)));
	if (explicit) {
		for (const candidate of candidates) {
			if (await isExecutable(candidate)) {
				if (await isSupersetManagedWrapper(candidate)) {
					const commandName = candidate.split(/[\\/]/).at(-1);
					if (!commandName) return null;
					return resolveAgentExecutable(commandName, env, options);
				}
				return { path: candidate, source: "explicit" };
			}
		}
		return null;
	}

	let skippedManagedWrapper = false;
	for (const candidate of candidates) {
		if (!(await isExecutable(candidate))) continue;
		// Dev/package-manager launchers prepend dependency bins to PATH. Those
		// executables are not available in the user's terminal and must not make a
		// bundled SDK dependency look like an installed agent CLI. An explicitly
		// configured path still remains valid through the branch above.
		if (isPackageManagerBin(candidate)) continue;
		if (await isSupersetManagedWrapper(candidate)) {
			skippedManagedWrapper = true;
			continue;
		}
		return {
			path: candidate,
			source: skippedManagedWrapper ? "wrapper" : "path",
		};
	}
	return null;
}
