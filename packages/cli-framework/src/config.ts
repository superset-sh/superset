import { dirname, resolve } from "node:path";
import type { GenericBuilderInternals } from "./option";

export interface CliConfig {
	name: string;
	version: string;
	/** Relative (to the config file) path to the commands directory. */
	commandsDir: string;
	/** Relative (to the config file) output path. Defaults to `./dist/<name>`. */
	outfile?: string;
	/** Build-time constants forwarded to `Bun.build({ define })`. */
	define?: Record<string, string>;
	/** Global option builders (shown on every command). */
	globals?: Record<string, GenericBuilderInternals>;
}

export function defineConfig(config: CliConfig): CliConfig {
	return config;
}

export interface LoadedConfig {
	config: CliConfig;
	configPath: string;
	root: string;
}

const CONFIG_FILENAME = "cli.config.ts";

export async function loadConfig(cwd: string): Promise<LoadedConfig> {
	let current = resolve(cwd);
	while (true) {
		const candidate = resolve(current, CONFIG_FILENAME);
		if (await Bun.file(candidate).exists()) {
			const mod = (await import(candidate)) as { default: CliConfig };
			return {
				config: mod.default,
				configPath: candidate,
				root: current,
			};
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	throw new Error(
		`Could not find ${CONFIG_FILENAME} in ${cwd} or any parent directory`,
	);
}
