import {
	type CliConfig,
	CONFIG_KEYS,
	loadConfig,
	resetConfig,
	setConfigValue,
} from "../lib/config.js";
import { bold, dim, error, green, info } from "../lib/output.js";

export function configCommand(args: string[]): void {
	const subcommand = args[0];

	if (!subcommand) {
		showConfig();
		return;
	}

	switch (subcommand) {
		case "set":
			setCommand(args.slice(1));
			break;
		case "get":
			getCommand(args.slice(1));
			break;
		case "reset":
			resetConfig();
			info("Config reset to defaults.");
			break;
		default:
			error(`Unknown subcommand: ${subcommand}. Use set, get, or reset.`);
			process.exit(1);
	}
}

function showConfig(): void {
	const config = loadConfig();
	console.log(bold("CLI Config:"));
	for (const [key, desc] of Object.entries(CONFIG_KEYS)) {
		const value = config[key as keyof CliConfig];
		console.log(`  ${key} = ${green(String(value))}  ${dim(desc)}`);
	}
}

function setCommand(args: string[]): void {
	const [key, value] = args;
	if (!key || !value) {
		error("Usage: superset config set <key> <value>");
		process.exit(1);
	}

	try {
		setConfigValue(key, value);
		info(`Set ${key} = ${value}`);
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}
}

function getCommand(args: string[]): void {
	const key = args[0];
	if (!key) {
		error("Usage: superset config get <key>");
		process.exit(1);
	}

	const config = loadConfig();
	if (!(key in config)) {
		error(
			`Unknown key: ${key}. Valid keys: ${Object.keys(CONFIG_KEYS).join(", ")}`,
		);
		process.exit(1);
	}

	console.log(config[key as keyof CliConfig]);
}
