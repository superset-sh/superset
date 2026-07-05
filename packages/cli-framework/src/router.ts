import type { CommandConfig } from "./command";
import { CLIError, suggestSimilar } from "./errors";
import type { CommandNode } from "./help";

export type CliGroup = {
	path: string[];
	description: string;
	aliases?: string[];
};

export type CliCommand = {
	path: string[];
	command: CommandConfig;
};

export function buildTree(
	groups: CliGroup[],
	commands: CliCommand[],
): {
	root: CommandNode;
	commandMap: Map<string, CommandConfig>;
} {
	const root: CommandNode = {
		name: "",
		children: new Map(),
		hasCommand: false,
	};
	const commandMap = new Map<string, CommandConfig>();

	for (const group of groups) {
		let node = root;
		for (const segment of group.path) {
			if (!node.children.has(segment)) {
				node.children.set(segment, {
					name: segment,
					children: new Map(),
					hasCommand: false,
				});
			}
			node = node.children.get(segment) as CommandNode;
		}
		node.description = group.description;
		node.aliases = group.aliases;
	}

	for (const entry of commands) {
		let node = root;
		for (const segment of entry.path) {
			if (!node.children.has(segment)) {
				node.children.set(segment, {
					name: segment,
					children: new Map(),
					hasCommand: false,
				});
			}
			node = node.children.get(segment) as CommandNode;
		}
		node.hasCommand = true;
		node.description = entry.command.description;
		if (entry.command.aliases) node.aliases = entry.command.aliases;
		commandMap.set(entry.path.join("/"), entry.command);
	}

	return { root, commandMap };
}

export function routeCommand(
	root: CommandNode,
	args: string[],
): { commandPath: string[]; remainingArgs: string[] } {
	const commandPath: string[] = [];
	let currentNode = root;
	let i = 0;

	for (; i < args.length; i++) {
		const segment = args[i] as string;
		if (segment.startsWith("-")) break;

		let matched = currentNode.children.get(segment);
		if (!matched) {
			for (const [, child] of currentNode.children) {
				if (child.aliases?.includes(segment)) {
					matched = child;
					break;
				}
			}
		}

		if (!matched) {
			if (currentNode.children.size > 0) {
				const candidates = [...currentNode.children.keys()];
				for (const [, child] of currentNode.children) {
					if (child.aliases) candidates.push(...child.aliases);
				}
				const suggestion = suggestSimilar(segment, candidates);
				throw new CLIError(
					`Unknown command: ${segment}`,
					suggestion ? `Did you mean "${suggestion}"?` : undefined,
				);
			}
			break;
		}

		commandPath.push(matched.name);
		currentNode = matched;
	}

	return { commandPath, remainingArgs: args.slice(i) };
}
