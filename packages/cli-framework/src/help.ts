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

export function generateRootHelp(
	name: string,
	version: string,
	root: CommandNode,
	globals?: Record<string, ProcessedBuilderConfig>,
): string {
	const lines: string[] = [];
	lines.push(`${name} v${version}`);
	lines.push("");
	lines.push(`Usage: ${name} <command> [options]`);
	lines.push("");

	if (root.children.size > 0) {
		lines.push("Commands:");
		const entries = [...root.children.entries()]
			.filter(([, node]) => node.children.size > 0 || node.hasCommand)
			.sort(([a], [b]) => a.localeCompare(b));

		const maxLen = Math.max(
			...entries.map(([name]) => {
				const node = root.children.get(name)!;
				const aliasStr = node.aliases?.length
					? ` (${node.aliases.join(", ")})`
					: "";
				return name.length + aliasStr.length;
			}),
		);

		for (const [cmdName, node] of entries) {
			const aliasStr = node.aliases?.length
				? ` (${node.aliases.join(", ")})`
				: "";
			const label = `${cmdName}${aliasStr}`.padEnd(maxLen + 2);
			lines.push(`  ${label}${node.description ?? ""}`);
		}
		lines.push("");
	}

	if (globals) {
		lines.push("Global options:");
		lines.push(...formatOptions(globals));
		lines.push("");
	}

	lines.push("  --help, -h       Show help");
	lines.push("  --version, -v    Show version");

	return lines.join("\n");
}

export function generateGroupHelp(
	name: string,
	path: string[],
	node: CommandNode,
	_globals?: Record<string, ProcessedBuilderConfig>,
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

	return lines.join("\n");
}

export function generateCommandHelp(
	name: string,
	path: string[],
	node: CommandNode,
	_globals?: Record<string, ProcessedBuilderConfig>,
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
			? `${config.aliases.map((a) => (a.startsWith("-") ? a : `-${a}`)).join(", ")}, `
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
