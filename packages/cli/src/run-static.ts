import type {
	GenericBuilderInternals,
	ProcessedBuilderConfig,
} from "@superset/cli-framework";
import {
	boolean,
	buildStaticTree,
	CLIError,
	camelToKebab,
	formatOutput,
	generateCommandHelp,
	generateGroupHelp,
	generateRootHelp,
	isAgentMode,
	parseArgv,
	resolveStaticMiddleware,
	routeCommand,
	string,
} from "@superset/cli-framework";
import { commands, groups, middlewareMap } from "./commands";

const NAME = "superset";
const VERSION = "0.1.0";

const globals = {
	json: boolean().desc("Output as JSON"),
	quiet: boolean().desc("Output IDs only"),
	device: string().env("SUPERSET_DEVICE").desc("Override device"),
};

export async function runStatic(): Promise<void> {
	const ac = new AbortController();
	const onSignal = () => ac.abort();
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);

	try {
		await execute(ac.signal);
	} catch (error) {
		if (error instanceof CLIError) {
			process.stderr.write(`Error: ${error.message}\n`);
			if (error.suggestion) process.stderr.write(`Hint: ${error.suggestion}\n`);
			process.exit(1);
		}
		if (error instanceof Error) {
			if (
				(error as any).data?.code === "UNAUTHORIZED" ||
				(error as any).code === "UNAUTHORIZED"
			) {
				process.stderr.write(
					"Error: Session expired\nHint: Run: superset auth login\n",
				);
			} else if (error.message.includes("fetch failed")) {
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

async function execute(signal: AbortSignal): Promise<void> {
	const args = process.argv.slice(2);

	const globalConfigs: Record<string, ProcessedBuilderConfig> = {};
	for (const [key, builder] of Object.entries(globals)) {
		const cfg = (builder as GenericBuilderInternals)._.config;
		globalConfigs[key] = { ...cfg, name: cfg.name ?? camelToKebab(key) };
	}

	const { root, middlewares, commandMap } = buildStaticTree(
		groups,
		commands,
		middlewareMap,
	);

	// Help with no command
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		const cleanArgs = args.filter((a) => a !== "--help" && a !== "-h");
		const routeResult = routeCommand(root, cleanArgs, "");

		if (routeResult.commandPath.length === 0) {
			console.log(generateRootHelp(NAME, VERSION, root, globalConfigs));
			return;
		}

		const cmdKey = routeResult.commandPath.join("/");
		const cmd = commandMap.get(cmdKey);
		const node = getNode(root, routeResult.commandPath);

		if (node && cmd) {
			node.description = cmd.description;
			if (cmd.options) {
				node.options = {};
				for (const [key, builder] of Object.entries(cmd.options)) {
					const cfg = (builder as GenericBuilderInternals)._.config;
					node.options[key] = { ...cfg, name: cfg.name ?? camelToKebab(key) };
				}
			}
			if (cmd.args) {
				node.args = (cmd.args as GenericBuilderInternals[]).map((b) => ({
					...b._.config,
					name: b._.config.name ?? "arg",
				}));
			}
			console.log(
				generateCommandHelp(NAME, routeResult.commandPath, node, globalConfigs),
			);
		} else if (node) {
			console.log(
				generateGroupHelp(NAME, routeResult.commandPath, node, globalConfigs),
			);
		}
		return;
	}

	if (args.includes("--version") || args.includes("-v")) {
		console.log(`${NAME} v${VERSION}`);
		return;
	}

	const { commandPath, remainingArgs } = routeCommand(root, args, "");

	if (commandPath.length === 0) {
		console.log(generateRootHelp(NAME, VERSION, root, globalConfigs));
		return;
	}

	const cmdKey = commandPath.join("/");
	const cmd = commandMap.get(cmdKey);

	if (!cmd) {
		const node = getNode(root, commandPath);
		if (node)
			console.log(generateGroupHelp(NAME, commandPath, node, globalConfigs));
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
			node.description = cmd.description;
			node.options = optionConfigs;
			if (cmd.args) {
				node.args = (cmd.args as GenericBuilderInternals[]).map((b) => ({
					...b._.config,
					name: b._.config.name ?? "arg",
				}));
			}
			console.log(generateCommandHelp(NAME, commandPath, node, globalConfigs));
		}
		return;
	}

	// Positional args
	const argsResult: Record<string, unknown> = {};
	if (cmd.args) {
		const positionalConfigs = (cmd.args as GenericBuilderInternals[]).map(
			(b) => b._.config,
		);
		let posIdx = 0;
		for (const posConfig of positionalConfigs) {
			const argName = posConfig.name ?? `arg${posIdx}`;
			if (posConfig.isVariadic) {
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

	// Middleware
	const mw = resolveStaticMiddleware(commandPath, middlewares);
	let ctx: Record<string, unknown> = {};

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

	const result = await cmd.run({
		options: parsed.options as any,
		args: argsResult as any,
		ctx,
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

function getNode(
	root: import("@superset/cli-framework").CommandNode,
	path: string[],
) {
	let node = root;
	for (const segment of path) {
		const child = node.children.get(segment);
		if (!child) return undefined;
		node = child;
	}
	return node;
}
