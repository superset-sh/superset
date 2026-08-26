import type { ProcessedBuilderConfig } from "./option";

export type CommandNode = {
	name: string;
	description?: string;
	aliases?: string[];
	children: Map<string, CommandNode>;
	hasCommand: boolean;
	options?: Record<string, ProcessedBuilderConfig>;
	args?: ProcessedBuilderConfig[];
};

/** Optional branding/curation for the root help screen. */
export interface HelpBranding {
	/** One-line pitch printed under the wordmark. */
	tagline?: string;
	/** Curated sections; listed command names come from the command tree. */
	sections?: Array<{ title: string; commands: string[] }>;
	/** Copy-paste examples shown before the command list. */
	examples?: Array<{ cmd: string; desc: string }>;
	docsUrl?: string;
	/** One-line closing tip. */
	tip?: string;
}

const useColor = () =>
	process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

type Paint = (s: string) => string;
const ansi =
	(open: string, close = "\x1b[0m"): Paint =>
	(s) =>
		useColor() ? `${open}${s}${close}` : s;

export const paint = {
	bold: ansi("\x1b[1m"),
	dim: ansi("\x1b[2m"),
	cyan: ansi("\x1b[36m"),
	green: ansi("\x1b[32m"),
	yellow: ansi("\x1b[33m"),
	magenta: ansi("\x1b[35m"),
	heading: ansi("\x1b[1m\x1b[4m"),
	invert: ansi("\x1b[7m"),
};

function visibleRootEntries(root: CommandNode): Array<[string, CommandNode]> {
	return [...root.children.entries()]
		.filter(([, node]) => node.children.size > 0 || node.hasCommand)
		.sort(([a], [b]) => a.localeCompare(b));
}

function commandLabel(name: string, node: CommandNode): string {
	const aliasStr = node.aliases?.length ? ` (${node.aliases.join(", ")})` : "";
	return `${name}${aliasStr}`;
}

export function generateRootHelp(
	name: string,
	version: string,
	root: CommandNode,
	globals?: Record<string, ProcessedBuilderConfig>,
	branding?: HelpBranding,
): string {
	const lines: string[] = [];
	lines.push(`${paint.bold(paint.cyan(name))} ${paint.dim(`v${version}`)}`);
	if (branding?.tagline) {
		lines.push(paint.dim(branding.tagline));
	}
	lines.push("");
	lines.push(
		`${paint.heading("Usage")}  ${name} ${paint.cyan("<command>")} ${paint.dim("[options]")}`,
	);
	lines.push("");

	const entries = visibleRootEntries(root);

	if (branding?.examples?.length) {
		lines.push(paint.heading("Examples"));
		for (const example of branding.examples) {
			lines.push(`  ${paint.dim("$")} ${paint.green(example.cmd)}`);
			lines.push(`    ${paint.dim(example.desc)}`);
		}
		lines.push("");
	}

	if (entries.length > 0) {
		const maxLen = Math.max(
			...entries.map(([n, node]) => commandLabel(n, node).length),
		);
		const renderEntry = ([cmdName, node]: [string, CommandNode]) => {
			const label = commandLabel(cmdName, node).padEnd(maxLen + 2);
			return `  ${paint.cyan(label)}${node.description ?? ""}`;
		};

		if (branding?.sections?.length) {
			lines.push(paint.heading("Commands"));
			const byName = new Map(entries);
			const seen = new Set<string>();
			for (const section of branding.sections) {
				const sectionEntries = section.commands.flatMap((n) => {
					const node = byName.get(n);
					if (!node) return [];
					seen.add(n);
					return [[n, node] as [string, CommandNode]];
				});
				if (sectionEntries.length === 0) continue;
				lines.push(`  ${paint.bold(section.title)}`);
				for (const entry of sectionEntries)
					lines.push(`  ${renderEntry(entry)}`);
			}
			const rest = entries.filter(([n]) => !seen.has(n));
			if (rest.length > 0) {
				lines.push(`  ${paint.bold("Other")}`);
				for (const entry of rest) lines.push(`  ${renderEntry(entry)}`);
			}
			lines.push("");
		} else {
			lines.push(paint.heading("Commands"));
			for (const entry of entries) lines.push(renderEntry(entry));
			lines.push("");
		}
	}

	if (globals && Object.keys(globals).length > 0) {
		lines.push(paint.heading("Global options"));
		lines.push(...formatOptions(globals));
		lines.push("");
	}

	lines.push(`  ${paint.cyan("--help, -h".padEnd(17))}Show help`);
	lines.push(`  ${paint.cyan("--version, -v".padEnd(17))}Show version`);

	const footer: string[] = [];
	if (branding?.docsUrl) {
		footer.push(`  ${paint.dim("Docs")}  ${paint.cyan(branding.docsUrl)}`);
	}
	if (branding?.tip) {
		footer.push(`  ${paint.dim("Tip")}   ${branding.tip}`);
	}
	if (footer.length > 0) {
		lines.push("");
		lines.push(...footer);
	}

	return lines.join("\n");
}

export function generateGroupHelp(
	name: string,
	path: string[],
	node: CommandNode,
	globals?: Record<string, ProcessedBuilderConfig>,
): string {
	const lines: string[] = [];
	const fullPath = [name, ...path].join(" ");
	lines.push(`Usage: ${fullPath} <command> [options]`);
	lines.push("");

	if (node.description) {
		lines.push(node.description);
		lines.push("");
	}

	if (node.children.size > 0) {
		lines.push("Commands:");
		const entries = [...node.children.entries()].sort(([a], [b]) =>
			a.localeCompare(b),
		);
		const maxLen = Math.max(...entries.map(([n]) => n.length));

		for (const [cmdName, child] of entries) {
			lines.push(`  ${cmdName.padEnd(maxLen + 2)}${child.description ?? ""}`);
		}
		lines.push("");
	}

	if (globals && Object.keys(globals).length > 0) {
		lines.push("Global options:");
		lines.push(...formatOptions(globals));
		lines.push("");
	}

	lines.push("  --help, -h       Show help");

	return lines.join("\n");
}

export function generateCommandHelp(
	name: string,
	path: string[],
	node: CommandNode,
	globals?: Record<string, ProcessedBuilderConfig>,
): string {
	const lines: string[] = [];
	const fullPath = [name, ...path].join(" ");

	// Usage line
	let usage = `Usage: ${fullPath}`;
	if (node.args?.length) {
		for (const arg of node.args) {
			const argName = arg.name ?? "arg";
			if (arg.isVariadic) {
				usage += arg.isRequired ? ` <${argName}...>` : ` [${argName}...]`;
			} else {
				usage += arg.isRequired ? ` <${argName}>` : ` [${argName}]`;
			}
		}
	}
	if (node.options && Object.keys(node.options).length > 0) {
		usage += " [options]";
	}
	lines.push(usage);
	lines.push("");

	if (node.description) {
		lines.push(node.description);
		lines.push("");
	}

	// Arguments
	if (node.args?.length) {
		lines.push("Arguments:");
		const maxLen = Math.max(...node.args.map((a) => (a.name ?? "arg").length));
		for (const arg of node.args) {
			const argName = (arg.name ?? "arg").padEnd(maxLen + 2);
			const parts = [arg.description ?? ""];
			if (arg.isRequired) parts.push("(required)");
			if (arg.isVariadic) parts.push("(variadic)");
			lines.push(`  ${argName}${parts.join(" ")}`);
		}
		lines.push("");
	}

	// Options
	if (node.options && Object.keys(node.options).length > 0) {
		lines.push("Options:");
		lines.push(...formatOptions(node.options));
		lines.push("");
	}

	if (globals && Object.keys(globals).length > 0) {
		lines.push("Global options:");
		lines.push(...formatOptions(globals));
		lines.push("");
	}

	lines.push("  --help, -h       Show help");

	return lines.join("\n");
}

function formatOptions(
	options: Record<string, ProcessedBuilderConfig>,
): string[] {
	const lines: string[] = [];

	const entries = Object.entries(options).filter(
		([, config]) => config.type !== "positional" && !config.isHidden,
	);

	if (entries.length === 0) return lines;

	const formatted = entries.map(([_key, config]) => {
		const flag = config.name.startsWith("-") ? config.name : `--${config.name}`;
		const aliasStr = config.aliases.length
			? `${config.aliases.map((a) => (a.startsWith("-") ? a : a.length > 1 ? `--${a}` : `-${a}`)).join(", ")}, `
			: "";

		let typeHint = "";
		if (config.type === "string") {
			typeHint = config.enumVals
				? ` <${config.enumVals.join("|")}>`
				: " <string>";
		} else if (config.type === "number") {
			typeHint = " <number>";
		}

		const label = `${aliasStr}${flag}${typeHint}`;

		const parts: string[] = [];
		if (config.description) parts.push(config.description);
		if (config.default !== undefined)
			parts.push(`(default: ${config.default})`);
		if (config.envVar) parts.push(`[$${config.envVar}]`);

		return { label, desc: parts.join(" ") };
	});

	const maxLen = Math.max(...formatted.map((f) => f.label.length));

	for (const { label, desc } of formatted) {
		lines.push(`  ${label.padEnd(maxLen + 2)}${desc}`);
	}

	return lines;
}
