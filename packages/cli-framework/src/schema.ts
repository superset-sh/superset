import { byName, type CliDescription, visibleChildren } from "./help";
import type { OptionType, ProcessedBuilderConfig } from "./option";

// The command tree as JSON for tooling that needs to know what is callable
// without parsing --help. Children and options are sorted and absent fields
// are omitted, so two builds of the same CLI diff cleanly.

export interface SchemaOption {
	name: string;
	aliases: string[];
	type: Exclude<OptionType, "positional">;
	required: boolean;
	description?: string;
	default?: unknown;
	enum?: string[];
	variadic?: true;
	int?: true;
	min?: number;
	max?: number;
	env?: string;
	/** Flag names this option cannot be combined with. */
	conflicts?: string[];
}

export interface SchemaArg {
	name: string;
	required: boolean;
	description?: string;
	enum?: string[];
	variadic?: true;
}

export interface SchemaCommand {
	path: string[];
	description?: string;
	aliases?: string[];
	options: SchemaOption[];
	args: SchemaArg[];
	commands: SchemaCommand[];
}

export interface CliSchema {
	name: string;
	version: string;
	globalOptions: SchemaOption[];
	commands: SchemaCommand[];
}

function defined<T extends object>(fields: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined),
	) as Partial<T>;
}

function toOption(
	config: ProcessedBuilderConfig,
	siblings: Record<string, ProcessedBuilderConfig>,
): SchemaOption {
	return {
		name: config.name,
		aliases: config.aliases,
		type: config.type as SchemaOption["type"],
		required: config.isRequired === true,
		...defined({
			description: config.description,
			default: config.default,
			enum: config.enumVals,
			variadic: config.isVariadic || undefined,
			int: config.isInt || undefined,
			min: config.minVal,
			max: config.maxVal,
			env: config.envVar,
			conflicts: config.conflictsWith?.map((key) => siblings[key]?.name ?? key),
		}),
	};
}

function toArg(config: ProcessedBuilderConfig): SchemaArg {
	return {
		name: config.name,
		required: config.isRequired === true,
		...defined({
			description: config.description,
			enum: config.enumVals,
			variadic: config.isVariadic || undefined,
		}),
	};
}

function options(configs: Record<string, ProcessedBuilderConfig> | undefined) {
	return Object.values(configs ?? {})
		.filter((config) => config.type !== "positional" && !config.isHidden)
		.map((config) => toOption(config, configs ?? {}))
		.sort((a, b) => byName(a.name, b.name));
}

function toCommand(
	path: string[],
	node: CliDescription["root"],
): SchemaCommand {
	return {
		path,
		...defined({
			description: node.description,
			aliases: node.aliases?.length ? node.aliases : undefined,
		}),
		options: options(node.options),
		args: (node.args ?? []).map(toArg),
		commands: visibleChildren(node).map(([name, child]) =>
			toCommand([...path, name], child),
		),
	};
}

export function generateSchema({
	name,
	version,
	root,
}: CliDescription): CliSchema {
	return {
		name,
		version,
		globalOptions: options(root.options),
		commands: visibleChildren(root).map(([child, node]) =>
			toCommand([child], node),
		),
	};
}
