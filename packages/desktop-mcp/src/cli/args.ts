export interface ParsedCliArgs {
	command: string;
	flags: Record<string, string[]>;
	positionals: string[];
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
	const [rawCommand, ...rest] = argv;
	const command = rawCommand ?? "help";
	const flags: Record<string, string[]> = {};
	const positionals: string[] = [];
	let positionalOnly = false;

	for (let index = 0; index < rest.length; index += 1) {
		const arg = rest[index];
		if (!arg) continue;

		if (positionalOnly || !arg.startsWith("--")) {
			positionals.push(arg);
			continue;
		}

		if (arg === "--") {
			positionalOnly = true;
			continue;
		}

		const [rawName, inlineValue] = arg.slice(2).split("=", 2);
		if (!rawName) continue;
		const next = rest[index + 1];
		const hasNextValue = next !== undefined && !next.startsWith("--");
		let value = inlineValue;
		if (value === undefined && hasNextValue) {
			index += 1;
			value = rest[index];
		}
		value ??= "true";
		flags[rawName] = [...(flags[rawName] ?? []), value];
	}

	return { command, flags, positionals };
}

export function getStringFlag(
	args: ParsedCliArgs,
	name: string,
): string | undefined {
	return args.flags[name]?.at(-1);
}

export function getStringListFlag(args: ParsedCliArgs, name: string): string[] {
	return args.flags[name] ?? [];
}

export function getBooleanFlag(
	args: ParsedCliArgs,
	name: string,
	defaultValue = false,
): boolean {
	const value = getStringFlag(args, name);
	if (value === undefined) return defaultValue;
	return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export function getNumberFlag(
	args: ParsedCliArgs,
	name: string,
): number | undefined {
	const value = getStringFlag(args, name);
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`--${name} must be a number`);
	}
	return parsed;
}

export function getIntegerFlag(
	args: ParsedCliArgs,
	name: string,
): number | undefined {
	const value = getNumberFlag(args, name);
	if (value === undefined) return undefined;
	if (!Number.isInteger(value)) {
		throw new Error(`--${name} must be an integer`);
	}
	return value;
}
