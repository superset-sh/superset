import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CommandConfig } from "./command";
import { CLIError, suggestSimilar } from "./errors";
import type { CommandNode } from "./help";
import { type MiddlewareExport, type MiddlewareFn, skip } from "./middleware";

export type RouteMatch = {
	commandPath: string[];
	commandDir: string;
	remainingArgs: string[];
	middlewareChain: (MiddlewareFn | null)[]; // null = skipped
};

export type CommandTree = {
	root: CommandNode;
	middlewares: Map<string, MiddlewareExport>;
};

/**
 * Scan the commands directory and build a tree of command nodes.
 * Only loads meta.ts and middleware.ts — command.ts is loaded lazily.
 */
export async function scanCommands(commandsDir: string): Promise<CommandTree> {
	const root: CommandNode = {
		name: "",
		children: new Map(),
		hasCommand: false,
	};

	const middlewares = new Map<string, MiddlewareExport>();

	await scanDir(commandsDir, root, middlewares);

	return { root, middlewares };
}

async function scanDir(
	dir: string,
	node: CommandNode,
	middlewares: Map<string, MiddlewareExport>,
): Promise<void> {
	const entries = readdirSync(dir, { withFileTypes: true });

	// Load middleware.ts if present
	const middlewarePath = join(dir, "middleware.ts");
	if (existsSync(middlewarePath)) {
		const mod = await import(middlewarePath);
		middlewares.set(dir, mod.default);
	}

	// Load meta.ts if present
	const metaPath = join(dir, "meta.ts");
	if (existsSync(metaPath)) {
		const mod = await import(metaPath);
		const meta = mod.default;
		if (meta.description) node.description = meta.description;
		if (meta.aliases) node.aliases = meta.aliases;
	}

	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
		if (entry.name === "middleware.ts" || entry.name === "meta.ts") continue;

		if (entry.isDirectory()) {
			const childName = entry.name;
			const childDir = join(dir, childName);

			// Check if this directory has a command.ts (it's a leaf command)
			const hasCommandFile = existsSync(join(childDir, "command.ts"));

			const childNode: CommandNode = {
				name: childName,
				children: new Map(),
				hasCommand: hasCommandFile,
			};

			node.children.set(childName, childNode);
			await scanDir(childDir, childNode, middlewares);
		}
	}
}

/**
 * Route argv segments through the command tree.
 * Returns the matched command path and directory.
 */
export function routeCommand(
	root: CommandNode,
	args: string[],
	commandsDir: string,
): { commandPath: string[]; commandDir: string; remainingArgs: string[] } {
	const commandPath: string[] = [];
	let currentNode = root;
	let currentDir = commandsDir;
	let i = 0;

	for (; i < args.length; i++) {
		const segment = args[i]!;

		// Skip flags
		if (segment.startsWith("-")) break;

		// Try to match a child
		let matched = currentNode.children.get(segment);

		// Try aliases
		if (!matched) {
			for (const [, child] of currentNode.children) {
				if (child.aliases?.includes(segment)) {
					matched = child;
					break;
				}
			}
		}

		if (!matched) {
			// If we're at a node with children, this might be a typo
			if (currentNode.children.size > 0) {
				const candidates = [...currentNode.children.keys()];
				// Also include aliases
				for (const [, child] of currentNode.children) {
					if (child.aliases) candidates.push(...child.aliases);
				}
				const suggestion = suggestSimilar(segment, candidates);
				if (suggestion) {
					throw new CLIError(
						`Unknown command: ${segment}`,
						`Did you mean "${suggestion}"?`,
					);
				}
			}
			break;
		}

		commandPath.push(matched.name);
		currentDir = join(currentDir, matched.name);
		currentNode = matched;
	}

	return {
		commandPath,
		commandDir: currentDir,
		remainingArgs: args.slice(i),
	};
}

/**
 * Lazily load the command.ts file for a matched route.
 */
export async function loadCommand(
	commandDir: string,
): Promise<CommandConfig | null> {
	const commandPath = join(commandDir, "command.ts");
	if (!existsSync(commandPath)) return null;
	const mod = await import(commandPath);
	return mod.default;
}

/**
 * Resolve the middleware for a command path.
 * Walks up from the command directory to the root, collecting middleware.
 * If any directory has `skip`, the entire chain above is skipped.
 */
export function resolveMiddleware(
	commandsDir: string,
	commandPath: string[],
	middlewares: Map<string, MiddlewareExport>,
): MiddlewareFn | null {
	// Walk from root to leaf, find the most specific middleware
	let dir = commandsDir;
	let activeMiddleware: MiddlewareFn | null = null;

	// Check root middleware
	const rootMw = middlewares.get(dir);
	if (rootMw && rootMw !== skip) {
		activeMiddleware = rootMw as MiddlewareFn;
	}

	// Walk command path
	for (const segment of commandPath) {
		dir = join(dir, segment);
		const mw = middlewares.get(dir);
		if (mw === skip) {
			activeMiddleware = null; // Skip all parent middleware
		} else if (mw) {
			activeMiddleware = mw as MiddlewareFn;
		}
	}

	return activeMiddleware;
}

/**
 * Build a command tree from static entries (for compiled binaries).
 * No filesystem access needed.
 */
export function buildStaticTree(
	groups: { path: string[]; description: string; aliases?: string[] }[],
	commands: { path: string[]; command: CommandConfig }[],
	middlewareMap: Record<string, MiddlewareExport>,
): {
	root: CommandNode;
	middlewares: Map<string, MiddlewareExport>;
	commandMap: Map<string, CommandConfig>;
} {
	const root: CommandNode = {
		name: "",
		children: new Map(),
		hasCommand: false,
	};

	const commandMap = new Map<string, CommandConfig>();

	// Create group nodes
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
			node = node.children.get(segment)!;
		}
		node.description = group.description;
		node.aliases = group.aliases;
	}

	// Create command nodes
	for (const entry of commands) {
		let node = root;
		for (let i = 0; i < entry.path.length; i++) {
			const segment = entry.path[i]!;
			if (!node.children.has(segment)) {
				node.children.set(segment, {
					name: segment,
					children: new Map(),
					hasCommand: false,
				});
			}
			node = node.children.get(segment)!;
		}
		node.hasCommand = true;
		node.description = entry.command.description;
		commandMap.set(entry.path.join("/"), entry.command);
	}

	// Convert middleware map to the format resolveMiddleware expects
	const middlewares = new Map<string, MiddlewareExport>();
	for (const [key, mw] of Object.entries(middlewareMap)) {
		middlewares.set(key, mw);
	}

	return { root, middlewares, commandMap };
}

/**
 * Resolve middleware using path-based keys (for static mode).
 */
export function resolveStaticMiddleware(
	commandPath: string[],
	middlewares: Map<string, MiddlewareExport>,
): MiddlewareFn | null {
	let activeMiddleware: MiddlewareFn | null = null;

	// Check root
	const rootMw = middlewares.get("");
	if (rootMw && rootMw !== skip) {
		activeMiddleware = rootMw as MiddlewareFn;
	}

	// Walk command path
	let pathSoFar = "";
	for (const segment of commandPath) {
		pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
		const mw = middlewares.get(pathSoFar) ?? middlewares.get(segment);
		if (mw === skip) {
			activeMiddleware = null;
		} else if (mw) {
			activeMiddleware = mw as MiddlewareFn;
		}
	}

	return activeMiddleware;
}
