import type { CommandConfig } from "./command";
import { CLIError } from "./errors";
import {
	generateCommandHelp,
	generateGroupHelp,
	generateRootHelp,
} from "./help";
import type { MiddlewareFn } from "./middleware";
import type { GenericBuilderInternals, ProcessedBuilderConfig } from "./option";
import { formatOutput } from "./output";
import { camelToKebab, isAgentMode, parseArgv } from "./parser";
import {
	buildTree,
	type CliCommand,
	type CliGroup,
	routeCommand,
} from "./router";

export interface CommandTree {
	commands: CliCommand[];
	groups: CliGroup[];
	middleware?: MiddlewareFn;
}

export interface RunOptions {
	name: string;
	version: string;
	tree: CommandTree;
	globals?: Record<string, GenericBuilderInternals>;
}

export async function run(opts: RunOptions): Promise<void> {
	const ac = new AbortController();
	const onSignal = () => ac.abort();
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);

	try {
		await execute(opts, opts.tree, ac.signal);
	} catch (error) {
		handleError(error, opts.name);
	} finally {
		process.off("SIGINT", onSignal);
		process.off("SIGTERM", onSignal);
	}
}

function handleError(error: unknown, cliName: string): never {
	if (error instanceof CLIError) {
		process.stderr.write(`Error: ${error.message}\n`);
		if (error.suggestion) process.stderr.write(`Hint: ${error.suggestion}\n`);
		process.exit(1);
	}
	if (error instanceof Error) {
		const trpcError = error as Error & {
			code?: string;
			data?: { code?: string };
		};
		const code = trpcError.data?.code ?? trpcError.code;
		if (code === "UNAUTHORIZED") {
			process.stderr.write(
				`Error: Session expired\nHint: Run: ${cliName} auth login\n`,
			);
		} else if (code === "NOT_FOUND") {
			process.stderr.write("Error: Not found\n");
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
}

function processGlobals(
	globals: Record<string, GenericBuilderInternals> | undefined,
): Record<string, ProcessedBuilderConfig> {
	const out: Record<string, ProcessedBuilderConfig> = {};
	if (!globals) return out;
	for (const [key, builder] of Object.entries(globals)) {
		const cfg = builder._.config;
		out[key] = { ...cfg, name: cfg.name ?? camelToKebab(key) };
	}
	return out;
}

/**
 * Split argv into command segments (non-flag tokens used for routing) and
 * passthrough tokens (global flags + everything after the first unknown
 * flag, which belongs to the leaf command's parser). Without this,
 * `routeCommand` would stop at the first `-` token and a leading global
 * flag like `superset --json auth check` would short-circuit to root help.
 */
function splitArgsForRouting(
	args: string[],
	globalConfigs: Record<string, ProcessedBuilderConfig>,
): { segments: string[]; passthrough: string[] } {
	const globalsByName = new Map<string, ProcessedBuilderConfig>();
	for (const cfg of Object.values(globalConfigs)) {
		globalsByName.set(cfg.name, cfg);
		for (const alias of cfg.aliases) globalsByName.set(alias, cfg);
	}

	const segments: string[] = [];
	const passthrough: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (!arg.startsWith("-")) {
			segments.push(arg);
			continue;
		}
		const eqIdx = arg.startsWith("--") ? arg.indexOf("=") : -1;
		const flagName = arg.startsWith("--")
			? eqIdx >= 0
				? arg.slice(2, eqIdx)
				: arg.slice(2)
			: arg.slice(1);
		const cfg = globalsByName.get(flagName);
		if (cfg) {
			passthrough.push(arg);
			if (cfg.type !== "boolean" && eqIdx < 0 && i + 1 < args.length) {
				passthrough.push(args[i + 1] as string);
				i++;
			}
			continue;
		}
		// Not a global — stop routing; everything else is for the leaf command.
		passthrough.push(...args.slice(i));
		break;
	}
	return { segments, passthrough };
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

function populateNodeForHelp(
	node: import("./help").CommandNode,
	cmd: CommandConfig,
	optionConfigs?: Record<string, ProcessedBuilderConfig>,
): void {
	node.description = cmd.description;
	if (optionConfigs) {
		node.options = optionConfigs;
	} else if (cmd.options) {
		node.options = {};
		for (const [key, builder] of Object.entries(cmd.options)) {
			const cfg = (builder as GenericBuilderInternals)._.config;
			node.options[key] = { ...cfg, name: cfg.name ?? camelToKebab(key) };
		}
	}
	if (cmd.args) {
		node.args = (cmd.args as GenericBuilderInternals[]).map((builder) => ({
			...builder._.config,
			name: builder._.config.name ?? "arg",
		}));
	}
}

async function execute(
	opts: RunOptions,
	loaded: CommandTree,
	signal: AbortSignal,
): Promise<void> {
	const args = process.argv.slice(2);
	const { name, version } = opts;
	const { middleware } = loaded;
	const globalConfigs = processGlobals(opts.globals);
	const { root, commandMap } = buildTree(loaded.groups, loaded.commands);

	// Help
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		const cleanArgs = args.filter((a) => a !== "--help" && a !== "-h");
		const { segments } = splitArgsForRouting(cleanArgs, globalConfigs);
		const routeResult = routeCommand(root, segments);
		if (routeResult.commandPath.length === 0) {
			console.log(generateRootHelp(name, version, root, globalConfigs));
			return;
		}
		const cmd = commandMap.get(routeResult.commandPath.join("/"));
		const node = getNode(root, routeResult.commandPath);
		if (node && cmd) {
			populateNodeForHelp(node, cmd);
			console.log(
				generateCommandHelp(name, routeResult.commandPath, node, globalConfigs),
			);
		} else if (node) {
			console.log(
				generateGroupHelp(name, routeResult.commandPath, node, globalConfigs),
			);
		}
		return;
	}

	const { segments, passthrough } = splitArgsForRouting(args, globalConfigs);
	const { commandPath, remainingArgs: unroutedSegments } = routeCommand(
		root,
		segments,
	);
	const remainingArgs = [...unroutedSegments, ...passthrough];

	// `--version` / `-v` print the CLI's version when no command resolved.
	// Once a command is in play, the flag is the command's to consume —
	// e.g. `superset update --version 0.1.2`.
	if (
		commandPath.length === 0 &&
		(args.includes("--version") || args.includes("-v"))
	) {
		console.log(`${name} v${version}`);
		return;
	}

	if (commandPath.length === 0) {
		console.log(generateRootHelp(name, version, root, globalConfigs));
		return;
	}

	const cmd = commandMap.get(commandPath.join("/"));
	if (!cmd) {
		const node = getNode(root, commandPath);
		if (node)
			console.log(generateGroupHelp(name, commandPath, node, globalConfigs));
		return;
	}

	const optionConfigs: Record<string, ProcessedBuilderConfig> = {};
	if (cmd.options) {
		for (const [key, builder] of Object.entries(cmd.options)) {
			const cfg = (builder as GenericBuilderInternals)._.config;
			optionConfigs[key] = { ...cfg, name: cfg.name ?? camelToKebab(key) };
		}
	}

	const parsed = parseArgv(
		["", "", ...remainingArgs],
		optionConfigs,
		globalConfigs,
	);

	if (parsed.options._help) {
		const node = getNode(root, commandPath);
		if (node) {
			populateNodeForHelp(node, cmd, optionConfigs);
			console.log(generateCommandHelp(name, commandPath, node, globalConfigs));
		}
		return;
	}

	// Positional args
	const argsResult: Record<string, unknown> = {};
	if (cmd.args) {
		const positionalConfigs = (cmd.args as GenericBuilderInternals[]).map(
			(builder) => builder._.config,
		);
		let posIdx = 0;
		let consumedVariadic = false;
		for (const posConfig of positionalConfigs) {
			const argName = posConfig.name ?? `arg${posIdx}`;
			if (posConfig.isVariadic) {
				argsResult[argName] = parsed.positionals.slice(posIdx);
				consumedVariadic = true;
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
		if (!consumedVariadic && parsed.positionals.length > posIdx) {
			throw new CLIError(`Unexpected argument: ${parsed.positionals[posIdx]}`);
		}
	}

	// Middleware (commands can opt out via skipMiddleware)
	let ctx: Record<string, unknown> = {};
	if (middleware && !cmd.skipMiddleware) {
		let nextCalled = false;
		await middleware({
			options: parsed.options,
			next: async (params) => {
				nextCalled = true;
				ctx = params.ctx;
				return undefined;
			},
		});
		if (!nextCalled) {
			throw new CLIError("Middleware did not initialize command context");
		}
	}

	const jsonFlag = parsed.options.json as boolean | undefined;
	const quietFlag = parsed.options.quiet as boolean | undefined;
	const isQuiet = quietFlag ?? false;
	// Agent-mode auto-JSON only when --quiet wasn't passed; --quiet beats it.
	const isJson = jsonFlag ?? (!isQuiet && isAgentMode());

	const result = await cmd.run({
		options: parsed.options as never,
		args: argsResult as never,
		ctx: ctx as never,
		signal,
	});

	if (result !== undefined) {
		const output = formatOutput(result, cmd.display, {
			json: isJson,
			quiet: isQuiet,
		});
		if (output) console.log(output);
	}
}
