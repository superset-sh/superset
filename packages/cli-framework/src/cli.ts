import { CLIError } from "./errors";
import {
	generateCommandHelp,
	generateGroupHelp,
	generateRootHelp,
} from "./help";
import type { GenericBuilderInternals, ProcessedBuilderConfig } from "./option";
import { formatOutput } from "./output";
import { camelToKebab, isAgentMode, parseArgv } from "./parser";
import {
	loadCommand,
	resolveMiddleware,
	routeCommand,
	scanCommands,
} from "./router";

export type CLIConfig = {
	name: string;
	version: string;
	commands: string;
	globals?: Record<string, GenericBuilderInternals>;
};

export async function cli(config: CLIConfig): Promise<void> {
	// Signal handling
	const ac = new AbortController();
	const onSignal = () => ac.abort();
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);

	try {
		await run(config, ac.signal);
	} catch (error) {
		if (error instanceof CLIError) {
			process.stderr.write(`Error: ${error.message}\n`);
			if (error.suggestion) {
				process.stderr.write(`Hint: ${error.suggestion}\n`);
			}
			process.exit(1);
		}

		if (error instanceof Error) {
			// tRPC errors have a `code` and `data` field
			const trpcError = error as Error & {
				code?: string;
				data?: { code?: string };
			};
			const code = trpcError.data?.code ?? trpcError.code;

			if (code === "UNAUTHORIZED") {
				process.stderr.write(
					"Error: Session expired\nHint: Run: superset auth login\n",
				);
			} else if (code === "NOT_FOUND") {
				process.stderr.write(`Error: Not found\n`);
			} else if (
				code === "FETCH_ERROR" ||
				error.message.includes("fetch failed")
			) {
				process.stderr.write(
					"Error: Could not connect to API\nHint: Is the API running?\n",
				);
			} else {
				process.stderr.write(`Error: ${error.message}\n`);
			}
			process.exit(1);
		}

		process.stderr.write(`Error: ${String(error)}\n`);
		process.exit(1);
	} finally {
		process.off("SIGINT", onSignal);
		process.off("SIGTERM", onSignal);
	}
}

async function run(config: CLIConfig, signal: AbortSignal): Promise<void> {
	const args = process.argv.slice(2);

	// Process global configs
	const globalConfigs: Record<string, ProcessedBuilderConfig> = {};
	if (config.globals) {
		for (const [key, builder] of Object.entries(config.globals)) {
			const cfg = (builder as GenericBuilderInternals)._.config;
			globalConfigs[key] = { ...cfg, name: cfg.name ?? camelToKebab(key) };
		}
	}

	// Scan command tree (lazy — only meta.ts and middleware.ts)
	const commandsDir = config.commands;
	const { root, middlewares } = await scanCommands(commandsDir);

	// Quick check for --help with no command
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		// Check if there's a command path first
		const routeResult = routeCommand(
			root,
			args.filter((a) => a !== "--help" && a !== "-h"),
			commandsDir,
		);

		if (routeResult.commandPath.length === 0) {
			// Load child descriptions for root help (groups get theirs from meta.ts, leaf commands from command.ts)
			await populateChildDescriptions(root, commandsDir);
			console.log(
				generateRootHelp(config.name, config.version, root, globalConfigs),
			);
			return;
		}

		// Load the command to get its options for help
		const cmd = await loadCommand(routeResult.commandDir);
		const node = getNode(root, routeResult.commandPath);

		if (node && cmd) {
			// Populate node with command info for help
			node.description = cmd.description;
			if (cmd.options) {
				node.options = {};
				for (const [key, builder] of Object.entries(cmd.options)) {
					const cfg = (builder as GenericBuilderInternals)._.config;
					node.options[key] = { ...cfg, name: cfg.name ?? camelToKebab(key) };
				}
			}
			if (cmd.args) {
				node.args = (cmd.args as GenericBuilderInternals[]).map((builder) => {
					const cfg = builder._.config;
					return { ...cfg, name: cfg.name ?? "arg" };
				});
			}
			console.log(
				generateCommandHelp(
					config.name,
					routeResult.commandPath,
					node,
					globalConfigs,
				),
			);
		} else if (node) {
			// Load child command descriptions for group help
			await populateChildDescriptions(node, routeResult.commandDir);
			console.log(
				generateGroupHelp(
					config.name,
					routeResult.commandPath,
					node,
					globalConfigs,
				),
			);
		}
		return;
	}

	// Check for --version
	if (args.includes("--version") || args.includes("-v")) {
		console.log(`${config.name} v${config.version}`);
		return;
	}

	// Route to command
	const { commandPath, commandDir, remainingArgs } = routeCommand(
		root,
		args,
		commandsDir,
	);

	if (commandPath.length === 0) {
		console.log(
			generateRootHelp(config.name, config.version, root, globalConfigs),
		);
		return;
	}

	// Lazy-load the matched command
	const cmd = await loadCommand(commandDir);

	if (!cmd) {
		// It's a group, not a leaf command — show group help
		const node = getNode(root, commandPath);
		if (node) {
			console.log(
				generateGroupHelp(config.name, commandPath, node, globalConfigs),
			);
		}
		return;
	}

	// Process command option configs
	const optionConfigs: Record<string, ProcessedBuilderConfig> = {};
	if (cmd.options) {
		for (const [key, builder] of Object.entries(cmd.options)) {
			const cfg = (builder as GenericBuilderInternals)._.config;
			optionConfigs[key] = { ...cfg, name: cfg.name ?? camelToKebab(key) };
		}
	}

	// Parse options from remaining args
	const parsed = parseArgv(
		["", "", ...remainingArgs], // parseArgv expects full argv shape
		optionConfigs,
		globalConfigs,
	);

	// Check for help flag on the command
	if (parsed.options._help) {
		const node = getNode(root, commandPath);
		if (node) {
			node.description = cmd.description;
			node.options = optionConfigs;
			if (cmd.args) {
				node.args = (cmd.args as GenericBuilderInternals[]).map((builder) => {
					const cfg = builder._.config;
					return { ...cfg, name: cfg.name ?? "arg" };
				});
			}
			console.log(
				generateCommandHelp(config.name, commandPath, node, globalConfigs),
			);
		}
		return;
	}

	// Handle positional args
	const argsResult: Record<string, unknown> = {};
	if (cmd.args) {
		const positionalConfigs = (cmd.args as GenericBuilderInternals[]).map(
			(builder) => builder._.config,
		);

		let posIdx = 0;
		for (const posConfig of positionalConfigs) {
			const argName = posConfig.name ?? `arg${posIdx}`;

			if (posConfig.isVariadic) {
				// Variadic: collect all remaining positionals
				argsResult[argName] = parsed.positionals.slice(posIdx);
				if (
					posConfig.isRequired &&
					(argsResult[argName] as string[]).length === 0
				) {
					throw new CLIError(`Missing required argument: <${argName}...>`);
				}
				break;
			}

			const value = parsed.positionals[posIdx];
			if (posConfig.isRequired && value === undefined) {
				throw new CLIError(`Missing required argument: <${argName}>`);
			}
			argsResult[argName] = value;
			posIdx++;
		}
	}

	// Resolve and run middleware
	const mw = resolveMiddleware(commandsDir, commandPath, middlewares);
	let ctx: Record<string, unknown> = {};

	// Determine output flags
	const jsonFlag = parsed.options.json as boolean | undefined;
	const quietFlag = parsed.options.quiet as boolean | undefined;
	const isJson = jsonFlag ?? isAgentMode();
	const isQuiet = quietFlag ?? false;

	if (mw) {
		await mw({
			options: parsed.options,
			next: async (params) => {
				ctx = params.ctx;
				return undefined;
			},
		});
	}

	// Run the handler
	const result = await cmd.run({
		options: parsed.options as any,
		args: argsResult as any,
		ctx,
		signal,
	});

	// Format and print output
	if (result !== undefined) {
		const output = formatOutput(result, cmd.display, {
			json: isJson,
			quiet: isQuiet,
		});
		if (output) {
			console.log(output);
		}
	}
}

function getNode(
	root: import("./help").CommandNode,
	path: string[],
): import("./help").CommandNode | undefined {
	let node = root;
	for (const segment of path) {
		const child = node.children.get(segment);
		if (!child) return undefined;
		node = child;
	}
	return node;
}

async function populateChildDescriptions(
	node: import("./help").CommandNode,
	dir: string,
): Promise<void> {
	const { join } = await import("node:path");
	for (const [name, child] of node.children) {
		if (child.description) continue;
		const cmd = await loadCommand(join(dir, name));
		if (cmd) {
			child.description = cmd.description;
		}
	}
}
