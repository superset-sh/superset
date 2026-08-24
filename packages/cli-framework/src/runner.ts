import type { CommandConfig } from "./command";
import { CLIError } from "./errors";
import {
	generateCommandHelp,
	generateGroupHelp,
	generateRootHelp,
	type HelpBranding,
} from "./help";
import { runInteractiveHelp } from "./interactive-help";
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
	help?: HelpBranding;
}

export async function run(opts: RunOptions): Promise<void> {
	const ac = new AbortController();
	const onSignal = () => ac.abort();
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);

	try {
		await execute(opts, opts.tree, ac.signal);
	} catch (error) {
		await handleError(error, opts.name, ac.signal);
	} finally {
		process.off("SIGINT", onSignal);
		process.off("SIGTERM", onSignal);
	}
}

function formatZodIssues(message: string): string | null {
	const trimmed = message.trim();
	if (!trimmed.startsWith("[")) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed) || parsed.length === 0) return null;
	const lines: string[] = [];
	for (const issue of parsed) {
		if (!issue || typeof issue !== "object") return null;
		const i = issue as { path?: unknown; message?: unknown };
		const pathSegments = Array.isArray(i.path) ? i.path : [];
		const path = pathSegments.length > 0 ? pathSegments.join(".") : "input";
		const msg = typeof i.message === "string" ? i.message : "invalid value";
		lines.push(`${path}: ${msg}`);
	}
	return lines.join("\n");
}

/** Exported for tests. */
export function formatError(
	error: unknown,
	cliName: string,
): { message: string; hint?: string } {
	if (error instanceof CLIError) {
		return { message: error.message, hint: error.suggestion };
	}
	if (error instanceof Error) {
		const trpcError = error as Error & {
			code?: string;
			data?: { code?: string };
		};
		const code = trpcError.data?.code ?? trpcError.code;
		if (code === "UNAUTHORIZED") {
			return {
				message: "Session expired",
				hint: `Run: ${cliName} auth login`,
			};
		}
		if (code === "NOT_FOUND") {
			// The server's message names the missing resource ("Host not
			// found") — blanking it left users with no way to tell which of
			// several ids a command resolves was rejected (issue #6415).
			return { message: error.message || "Not found" };
		}
		if (code === "FETCH_ERROR" || error.message.includes("fetch failed")) {
			return {
				message: "Could not connect to API",
				hint: "Is the API running?",
			};
		}
		const formatted = formatZodIssues(error.message);
		return { message: formatted ?? error.message };
	}
	return { message: String(error) };
}

async function handleError(
	error: unknown,
	cliName: string,
	signal?: AbortSignal,
): Promise<never> {
	const { message, hint } = formatError(error, cliName);
	const text = `Error: ${message}\n${hint ? `Hint: ${hint}\n` : ""}`;
	// Same drain rule as stdout (see writeStream): exiting before the pipe
	// reader catches up would drop the message. Best effort; a failed stderr
	// write must not mask the exit code.
	await writeStream(process.stderr, text, signal).catch(() => {});
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
	argsOverride?: string[],
): Promise<void> {
	const args = argsOverride ?? process.argv.slice(2);
	const { name, version } = opts;
	const { middleware } = loaded;
	const globalConfigs = processGlobals(opts.globals);
	const { root, commandMap } = buildTree(loaded.groups, loaded.commands);

	// EXPERIMENT: bare invocation on a TTY opens the interactive help browser
	// instead of dumping static help. Agents/CI keep the static output.
	if (
		args.length === 0 &&
		process.stdin.isTTY === true &&
		process.stdout.isTTY === true &&
		!isAgentMode()
	) {
		const result = await runInteractiveHelp({
			name,
			version,
			root,
			globals: globalConfigs,
			branding: opts.help,
			signal,
			populateLeaf: (path, node) => {
				const cmd = commandMap.get(path.join("/"));
				if (cmd) populateNodeForHelp(node, cmd);
			},
		});
		if (result.runArgs) {
			console.log("");
			return execute(opts, loaded, signal, result.runArgs);
		}
		return;
	}

	// Help
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		const cleanArgs = args.filter((a) => a !== "--help" && a !== "-h");
		const { segments } = splitArgsForRouting(cleanArgs, globalConfigs);
		const routeResult = routeCommand(root, segments);
		if (routeResult.commandPath.length === 0) {
			console.log(
				generateRootHelp(name, version, root, globalConfigs, opts.help),
			);
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
		console.log(version);
		return;
	}

	if (commandPath.length === 0) {
		console.log(
			generateRootHelp(name, version, root, globalConfigs, opts.help),
		);
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
			commandPath,
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
		// All command output must leave through writeStream; a bare console.log
		// here reintroduces truncation for any payload past the pipe buffer.
		if (output) await writeStream(process.stdout, `${output}\n`, signal);
	}
}

/**
 * console.log queues pipe writes asynchronously; when the process exits while
 * the reader is slow, Bun drops the still-queued tail, truncating output
 * beyond ~64KB (seen with `superset tasks list --json | jq` and `$(...)`
 * capture). Awaiting the write callback keeps the process alive until the
 * whole payload reaches the pipe.
 */
function writeStream(
	stream: NodeJS.WriteStream,
	text: string,
	signal?: AbortSignal,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			fn();
		};
		stream.write(text, (error) =>
			settle(() => (error ? reject(error) : resolve())),
		);
		// A full pipe whose reader never drains would otherwise wait forever
		// and swallow SIGINT/SIGTERM (run() replaces their default exit). On
		// abort, stop waiting and let the exit path proceed; losing the tail
		// is the right trade once the user asked to stop.
		if (signal?.aborted) settle(resolve);
		else
			signal?.addEventListener("abort", () => settle(resolve), {
				once: true,
			});
	});
}
