import type { CommandNode } from "./help";
import type { ProcessedBuilderConfig } from "./option";

// The CLI's full command tree as plain JSON — herdr's `api schema`/`api
// snapshot` equivalent: `--help` is for a human reading text; this is for
// tooling (an agent, a script) that wants to know exactly what's callable,
// with what options, without parsing help output.

export interface SchemaOption {
	name: string;
	aliases: string[];
	type: string;
	required: boolean;
	default?: unknown;
	enumVals?: string[];
	isVariadic?: boolean;
	description?: string;
	envVar?: string;
}

export interface SchemaCommand {
	path: string[];
	description?: string;
	aliases?: string[];
	options: SchemaOption[];
	args: SchemaOption[];
	commands: SchemaCommand[];
}

export interface CliSchema {
	name: string;
	globalOptions: SchemaOption[];
	commands: SchemaCommand[];
}

function toSchemaOption(config: ProcessedBuilderConfig): SchemaOption {
	return {
		name: config.name,
		aliases: config.aliases,
		type: config.type,
		required: config.isRequired === true,
		...(config.default !== undefined ? { default: config.default } : {}),
		...(config.enumVals ? { enumVals: config.enumVals } : {}),
		...(config.isVariadic ? { isVariadic: true } : {}),
		...(config.description ? { description: config.description } : {}),
		...(config.envVar ? { envVar: config.envVar } : {}),
	};
}

function ownOptions(node: CommandNode): SchemaOption[] {
	return Object.values(node.options ?? {})
		.filter((config) => config.type !== "positional" && !config.isHidden)
		.map(toSchemaOption);
}

function visibleChildren(node: CommandNode): Array<[string, CommandNode]> {
	return [...node.children.entries()]
		.filter(([, child]) => child.children.size > 0 || child.hasCommand)
		.sort(([a], [b]) => a.localeCompare(b));
}

function buildSchemaCommand(path: string[], node: CommandNode): SchemaCommand {
	return {
		path,
		...(node.description ? { description: node.description } : {}),
		...(node.aliases?.length ? { aliases: node.aliases } : {}),
		options: ownOptions(node),
		args: (node.args ?? []).map(toSchemaOption),
		commands: visibleChildren(node).map(([name, child]) =>
			buildSchemaCommand([...path, name], child),
		),
	};
}

/** See module doc comment. */
export function generateSchema(root: CommandNode, binName: string): CliSchema {
	return {
		name: binName,
		globalOptions: ownOptions(root),
		commands: visibleChildren(root).map(([name, child]) =>
			buildSchemaCommand([name], child),
		),
	};
}
