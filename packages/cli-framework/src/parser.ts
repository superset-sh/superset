import { CLIError } from "./errors";
import type { ProcessedBuilderConfig } from "./option";

const AGENT_ENV_VARS = [
	"CLAUDE_CODE",
	"CLAUDECODE",
	"CLAUDE_CODE_ENTRYPOINT",
	"CODEX_CLI",
	"GEMINI_CLI",
	"SUPERSET_AGENT",
	"CI",
];

export function isAgentMode(): boolean {
	return AGENT_ENV_VARS.some((v) => {
		const value = process.env[v];
		return value !== undefined && value !== "";
	});
}

export function camelToKebab(str: string): string {
	return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

export type ParseResult = {
	commandPath: string[];
	options: Record<string, unknown>;
	positionals: string[];
};

export function parseArgv(
	argv: string[],
	optionConfigs: Record<string, ProcessedBuilderConfig>,
	globalConfigs?: Record<string, ProcessedBuilderConfig>,
): ParseResult {
	const args = argv.slice(2);
	const commandPath: string[] = [];
	const options: Record<string, unknown> = {};
	const positionals: string[] = [];
	let dashdash = false;

	// Build lookup maps
	const optionsByFlag = new Map<string, [string, ProcessedBuilderConfig]>();
	const allConfigs = { ...globalConfigs, ...optionConfigs };

	for (const [key, config] of Object.entries(allConfigs)) {
		if (config.type === "positional") continue;
		const flag = config.name.startsWith("-")
			? config.name
			: config.name.length > 1
				? `--${config.name}`
				: `-${config.name}`;
		optionsByFlag.set(flag, [key, config]);
		for (const alias of config.aliases) {
			const aliasFlag = alias.startsWith("-")
				? alias
				: alias.length > 1
					? `--${alias}`
					: `-${alias}`;
			optionsByFlag.set(aliasFlag, [key, config]);
		}
	}

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;

		// -- separator: everything after is positional
		if (arg === "--") {
			dashdash = true;
			continue;
		}

		if (dashdash) {
			positionals.push(arg);
			continue;
		}

		// Help/version shortcuts. If the command declares its own --version
		// or --help option (e.g. `update --version 0.1.2`), defer to normal
		// option parsing instead of short-circuiting.
		if ((arg === "--help" || arg === "-h") && !optionsByFlag.has("--help")) {
			options._help = true;
			continue;
		}
		if (
			(arg === "--version" || arg === "-v") &&
			!optionsByFlag.has("--version")
		) {
			options._version = true;
			continue;
		}

		// --no-flag negation
		if (arg.startsWith("--no-")) {
			const positiveName = `--${arg.slice(5)}`;
			const entry = optionsByFlag.get(positiveName);
			if (entry && entry[1].type === "boolean") {
				options[entry[0]] = false;
				continue;
			}
		}

		// --flag=value
		if (arg.includes("=") && arg.startsWith("-")) {
			const eqIdx = arg.indexOf("=");
			const flagPart = arg.slice(0, eqIdx);
			const valuePart = arg.slice(eqIdx + 1);
			const entry = optionsByFlag.get(flagPart);

			if (!entry) {
				throw new CLIError(`Unknown option: ${flagPart}`);
			}

			options[entry[0]] = coerce(entry[1], valuePart, flagPart);
			continue;
		}

		// --flag value or -f value
		if (arg.startsWith("-")) {
			const entry = optionsByFlag.get(arg);
			if (!entry) {
				throw new CLIError(`Unknown option: ${arg}`);
			}

			if (entry[1].type === "boolean") {
				// Boolean: check if next arg is a boolean value
				const next = args[i + 1]?.toLowerCase();
				if (next === "true" || next === "1") {
					options[entry[0]] = true;
					i++;
				} else if (next === "false" || next === "0") {
					options[entry[0]] = false;
					i++;
				} else {
					options[entry[0]] = true;
				}
				continue;
			}

			// String/number: consume next arg as value
			const nextArg = args[i + 1];
			if (nextArg === undefined || nextArg.startsWith("-")) {
				throw new CLIError(
					`Option ${arg} requires a value`,
					entry[1].enumVals
						? `Valid values: ${entry[1].enumVals.join(", ")}`
						: undefined,
				);
			}

			options[entry[0]] = coerce(entry[1], nextArg, arg);
			i++;
			continue;
		}

		// Non-flag token: could be command path segment or positional
		positionals.push(arg);
	}

	// Resolve env vars for unfilled options
	for (const [key, config] of Object.entries(allConfigs)) {
		if (options[key] !== undefined) continue;
		if (config.envVar && process.env[config.envVar] !== undefined) {
			options[key] = coerce(
				config,
				process.env[config.envVar]!,
				`$${config.envVar}`,
			);
		}
	}

	// Apply defaults
	for (const [key, config] of Object.entries(allConfigs)) {
		if (options[key] === undefined && config.default !== undefined) {
			options[key] = config.default;
		}
	}

	// Validate required options
	for (const [key, config] of Object.entries(allConfigs)) {
		if (config.type === "positional") continue;
		if (config.isRequired && options[key] === undefined) {
			const flag = config.name.startsWith("-")
				? config.name
				: `--${config.name}`;
			throw new CLIError(`Missing required option: ${flag}`);
		}
	}

	// Validate conflicts
	for (const [key, config] of Object.entries(allConfigs)) {
		if (!config.conflictsWith || options[key] === undefined) continue;
		for (const conflictKey of config.conflictsWith) {
			if (options[conflictKey] !== undefined) {
				const flag1 = config.name.startsWith("-")
					? config.name
					: `--${config.name}`;
				const conflictConfig = allConfigs[conflictKey];
				const flag2 = conflictConfig
					? conflictConfig.name.startsWith("-")
						? conflictConfig.name
						: `--${conflictConfig.name}`
					: `--${conflictKey}`;
				throw new CLIError(
					`Options ${flag1} and ${flag2} cannot be used together`,
				);
			}
		}
	}

	return { commandPath, options, positionals };
}

function coerce(
	config: ProcessedBuilderConfig,
	value: string,
	source: string,
): string | number | boolean {
	if (config.type === "number") {
		const num = Number(value);
		if (Number.isNaN(num)) {
			throw new CLIError(`${source}: expected a number, got "${value}"`);
		}
		if (config.isInt && !Number.isInteger(num)) {
			throw new CLIError(`${source}: expected an integer, got "${value}"`);
		}
		if (config.minVal !== undefined && num < config.minVal) {
			throw new CLIError(
				`${source}: value ${num} is below minimum ${config.minVal}`,
			);
		}
		if (config.maxVal !== undefined && num > config.maxVal) {
			throw new CLIError(
				`${source}: value ${num} is above maximum ${config.maxVal}`,
			);
		}
		return num;
	}

	if (config.type === "boolean") {
		const lower = value.toLowerCase();
		if (lower === "true" || lower === "1") return true;
		if (lower === "false" || lower === "0") return false;
		throw new CLIError(`${source}: expected boolean, got "${value}"`);
	}

	// String
	if (config.enumVals && !config.enumVals.includes(value)) {
		throw new CLIError(
			`${source}: invalid value "${value}"`,
			`Valid values: ${config.enumVals.join(", ")}`,
		);
	}

	return value;
}
