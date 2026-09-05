import type { CommandNode } from "./help";
import type { ProcessedBuilderConfig } from "./option";

// Shell completion scripts generated from the command tree. Options on the
// root node are the CLI's globals and are offered at every level.

interface Flag {
	/** `--name` plus every alias, all in flag form. */
	tokens: string[];
	description: string;
	takesValue: boolean;
	enumVals?: string[];
}

interface Subcommand {
	name: string;
	aliases: string[];
	description: string;
}

interface Positional {
	enumVals?: string[];
	isVariadic: boolean;
}

interface NodeSpec {
	path: string[];
	subcommands: Subcommand[];
	flags: Flag[];
	args: Positional[];
}

const HELP: Flag = {
	tokens: ["--help", "-h"],
	description: "Show help",
	takesValue: false,
};
const VERSION: Flag = {
	tokens: ["--version", "-v"],
	description: "Show version",
	takesValue: false,
};

// Anything outside this set would need shell quoting inside `compgen -W`
// word lists and `case` patterns; such names are dropped rather than quoted.
const SAFE_WORD = /^[A-Za-z0-9@%+=:,./_-]+$/;

function flagToken(name: string): string {
	if (name.startsWith("-")) return name;
	return name.length > 1 ? `--${name}` : `-${name}`;
}

function oneLine(text: string | undefined): string {
	return (text ?? "").replace(/\s+/g, " ").trim();
}

function visibleChildren(node: CommandNode): Array<[string, CommandNode]> {
	return [...node.children.entries()]
		.filter(([, child]) => child.children.size > 0 || child.hasCommand)
		.sort(([a], [b]) => a.localeCompare(b));
}

function ownFlags(node: CommandNode): Flag[] {
	return Object.values(node.options ?? {})
		.filter((config) => config.type !== "positional" && !config.isHidden)
		.map((config) => ({
			tokens: [config.name, ...config.aliases].map(flagToken),
			description: oneLine(config.description),
			takesValue: config.type !== "boolean",
			enumVals: config.enumVals,
		}));
}

function dedupeFlags(flags: Flag[]): Flag[] {
	const seen = new Set<string>();
	const out: Flag[] = [];
	for (const flag of flags) {
		const tokens = flag.tokens.filter((t) => !seen.has(t) && SAFE_WORD.test(t));
		if (tokens.length === 0) continue;
		for (const t of tokens) seen.add(t);
		out.push({ ...flag, tokens });
	}
	return out;
}

function positionals(args: ProcessedBuilderConfig[] | undefined): Positional[] {
	return (args ?? []).map((arg) => ({
		enumVals: arg.enumVals,
		isVariadic: arg.isVariadic === true,
	}));
}

function collectSpecs(root: CommandNode): NodeSpec[] {
	const globals = ownFlags(root);
	const specs: NodeSpec[] = [];
	const visit = (path: string[], node: CommandNode) => {
		const own = ownFlags(node);
		const flags =
			path.length === 0 ? [...own, HELP, VERSION] : [...own, ...globals, HELP];
		specs.push({
			path,
			subcommands: visibleChildren(node)
				.filter(([name]) => SAFE_WORD.test(name))
				.map(([name, child]) => ({
					name,
					aliases: (child.aliases ?? []).filter((a) => SAFE_WORD.test(a)),
					description: oneLine(child.description),
				})),
			flags: dedupeFlags(flags),
			args: positionals(node.args),
		});
		for (const [name, child] of visibleChildren(node)) {
			visit([...path, name], child);
		}
	};
	visit([], root);
	return specs;
}

function safeValues(values: string[] | undefined): string[] {
	return (values ?? []).filter((v) => SAFE_WORD.test(v));
}

function shellIdentifier(binName: string): string {
	return binName.replace(/[^A-Za-z0-9_]/g, "_");
}

/** Single-quote for sh/zsh. */
function sq(text: string): string {
	return `'${text.replace(/'/g, "'\\''")}'`;
}

interface CaseArm {
	pattern: string;
	body: string[];
}

function caseLines(subject: string, arms: CaseArm[], indent: string): string[] {
	const lines = [`${indent}case "${subject}" in`];
	for (const arm of arms) {
		if (arm.body.length === 1) {
			lines.push(`${indent}\t${arm.pattern}) ${arm.body[0]} ;;`);
		} else {
			lines.push(
				`${indent}\t${arm.pattern})`,
				...arm.body.map((line) => `${indent}\t\t${line}`),
				`${indent}\t\t;;`,
			);
		}
	}
	lines.push(`${indent}esac`);
	return lines;
}

function shellFunction(name: string, body: string[]): string[] {
	return [`${name}() {`, ...body.map((line) => `\t${line}`), "}", ""];
}

function pathPattern(spec: NodeSpec): string {
	return sq(spec.path.join(" "));
}

function subcommandPattern(sub: Subcommand): string {
	return [sub.name, ...sub.aliases].join("|");
}

/** Arms keyed by path, each holding a nested case on `$2`. */
function nestedArms(
	specs: NodeSpec[],
	inner: (spec: NodeSpec) => CaseArm[],
): CaseArm[] {
	const arms: CaseArm[] = [];
	for (const spec of specs) {
		const innerArms = inner(spec);
		if (innerArms.length === 0) continue;
		arms.push({
			pattern: pathPattern(spec),
			body: caseLines("$2", innerArms, ""),
		});
	}
	return arms;
}

function flagValueArms(
	spec: NodeSpec,
	render: (values: string[]) => string,
): CaseArm[] {
	return spec.flags.flatMap((flag) => {
		const values = safeValues(flag.enumVals);
		if (values.length === 0) return [];
		return [{ pattern: flag.tokens.join("|"), body: [render(values)] }];
	});
}

function argValueArms(
	spec: NodeSpec,
	render: (values: string[]) => string,
): CaseArm[] {
	return spec.args.flatMap((arg, index) => {
		const values = safeValues(arg.enumVals);
		if (values.length === 0) return [];
		// A variadic positional is always last, so it owns every later slot.
		return [
			{ pattern: arg.isVariadic ? "*" : String(index), body: [render(values)] },
		];
	});
}

export function generateBashCompletion(
	root: CommandNode,
	binName: string,
): string {
	const specs = collectSpecs(root);
	const fn = `_${shellIdentifier(binName)}`;
	const echo = (words: string[]) => `echo ${sq(words.join(" "))}`;

	const lines: string[] = [
		`# ${binName} bash completion — generated by \`${binName} completion bash\`.`,
		`# Load with: source <(${binName} completion bash)`,
		"",
		'# Each lookup takes the command path so far ("" at the root), space-joined.',
		...shellFunction(
			`${fn}__subcommands`,
			caseLines(
				"$1",
				specs
					.filter((spec) => spec.subcommands.length > 0)
					.map((spec) => ({
						pattern: pathPattern(spec),
						body: [echo(spec.subcommands.map((sub) => sub.name))],
					})),
				"",
			),
		),
		"# Canonical name for a subcommand or one of its aliases.",
		...shellFunction(
			`${fn}__resolve`,
			caseLines(
				"$1",
				nestedArms(specs, (spec) =>
					spec.subcommands.map((sub) => ({
						pattern: subcommandPattern(sub),
						body: [`echo ${sq(sub.name)}`],
					})),
				),
				"",
			),
		),
		...shellFunction(
			`${fn}__flags`,
			caseLines(
				"$1",
				specs.map((spec) => ({
					pattern: pathPattern(spec),
					body: [echo(spec.flags.flatMap((flag) => flag.tokens))],
				})),
				"",
			),
		),
		"# Flags that consume the following word.",
		...shellFunction(
			`${fn}__value_flags`,
			caseLines(
				"$1",
				specs
					.filter((spec) => spec.flags.some((flag) => flag.takesValue))
					.map((spec) => ({
						pattern: pathPattern(spec),
						body: [
							echo(
								spec.flags
									.filter((flag) => flag.takesValue)
									.flatMap((flag) => flag.tokens),
							),
						],
					})),
				"",
			),
		),
		"# Fixed values for an enum flag.",
		...shellFunction(
			`${fn}__flag_values`,
			caseLines(
				"$1",
				nestedArms(specs, (spec) => flagValueArms(spec, echo)),
				"",
			),
		),
		"# Fixed values for the Nth positional argument (0-based).",
		...shellFunction(
			`${fn}__arg_values`,
			caseLines(
				"$1",
				nestedArms(specs, (spec) => argValueArms(spec, echo)),
				"",
			),
		),
		...shellFunction(`${fn}__takes_value`, [
			"local f",
			`for f in $(${fn}__value_flags "$1"); do`,
			'\t[[ "$f" == "$2" ]] && return 0',
			"done",
			"return 1",
		]),
		...shellFunction(fn, [
			"local cur prev word candidates path='' npos=0 descending=1 resolved i",
			"COMPREPLY=()",
			`cur="\${COMP_WORDS[COMP_CWORD]}"`,
			"# Walk the words before the cursor down the command tree; flags (and",
			"# their values) are skipped, and the first positional stops the descent.",
			"for ((i = 1; i < COMP_CWORD; i++)); do",
			`\tword="\${COMP_WORDS[i]}"`,
			'\tcase "$word" in',
			"\t\t--) descending=0; continue ;;",
			"\t\t--*=*) continue ;;",
			"\t\t-*)",
			`\t\t\tif ${fn}__takes_value "$path" "$word"; then i=$((i + 1)); fi`,
			"\t\t\tcontinue",
			"\t\t\t;;",
			"\tesac",
			"\tif [[ $descending -eq 1 ]]; then",
			`\t\tresolved="$(${fn}__resolve "$path" "$word")"`,
			'\t\tif [[ -n "$resolved" ]]; then',
			`\t\t\tpath="\${path:+$path }$resolved"`,
			"\t\t\tcontinue",
			"\t\tfi",
			"\t\tdescending=0",
			"\tfi",
			"\tnpos=$((npos + 1))",
			"done",
			"prev=''",
			`if [[ $COMP_CWORD -gt 0 ]]; then prev="\${COMP_WORDS[COMP_CWORD - 1]}"; fi`,
			`if [[ "$prev" == -* && "$prev" != --*=* && "$prev" != -- ]] && ${fn}__takes_value "$path" "$prev"; then`,
			`\tcandidates="$(${fn}__flag_values "$path" "$prev")"`,
			'\tif [[ -z "$candidates" ]]; then',
			"\t\t# Free-form value: let readline offer filenames.",
			"\t\ttype compopt >/dev/null 2>&1 && compopt -o default 2>/dev/null",
			"\t\treturn 0",
			"\tfi",
			'elif [[ "$cur" == -* ]]; then',
			`\tcandidates="$(${fn}__flags "$path")"`,
			"else",
			`\tcandidates="$(${fn}__subcommands "$path")"`,
			'\tif [[ -z "$candidates" ]]; then',
			`\t\tcandidates="$(${fn}__arg_values "$path" "$npos")"`,
			"\tfi",
			"fi",
			'COMPREPLY=($(compgen -W "$candidates" -- "$cur"))',
		]),
		`complete -F ${fn} ${binName}`,
		"",
	];
	return lines.join("\n");
}

export function generateZshCompletion(
	root: CommandNode,
	binName: string,
): string {
	const specs = collectSpecs(root);
	const fn = `_${shellIdentifier(binName)}`;
	// `_describe` splits each entry on its first unescaped colon.
	const entry = (name: string, description: string) =>
		sq(
			description
				? `${name.replace(/:/g, "\\:")}:${description.replace(/:/g, "\\:")}`
				: name.replace(/:/g, "\\:"),
		);
	const reply = (entries: string[]) => `reply=(${entries.join(" ")})`;
	const plain = (values: string[]) => reply(values.map((v) => entry(v, "")));

	const lines: string[] = [
		`#compdef ${binName}`,
		`# ${binName} zsh completion — generated by \`${binName} completion zsh\`.`,
		`# Load with: source <(${binName} completion zsh)`,
		`# Or install it on your fpath as _${binName} and run compinit.`,
		"",
		'# Each lookup takes the command path so far ("" at the root), space-joined,',
		"# and answers in the caller's `reply` array as name:description entries.",
		...shellFunction(`${fn}__subcommands`, [
			"reply=()",
			...caseLines(
				"$1",
				specs
					.filter((spec) => spec.subcommands.length > 0)
					.map((spec) => ({
						pattern: pathPattern(spec),
						body: [
							reply(
								spec.subcommands.map((sub) => entry(sub.name, sub.description)),
							),
						],
					})),
				"",
			),
		]),
		"# Canonical name for a subcommand or one of its aliases.",
		...shellFunction(
			`${fn}__resolve`,
			caseLines(
				"$1",
				nestedArms(specs, (spec) =>
					spec.subcommands.map((sub) => ({
						pattern: subcommandPattern(sub),
						body: [`echo ${sq(sub.name)}`],
					})),
				),
				"",
			),
		),
		...shellFunction(`${fn}__flags`, [
			"reply=()",
			...caseLines(
				"$1",
				specs.map((spec) => ({
					pattern: pathPattern(spec),
					body: [
						reply(
							spec.flags.flatMap((flag) =>
								flag.tokens.map((token) => entry(token, flag.description)),
							),
						),
					],
				})),
				"",
			),
		]),
		"# Flags that consume the following word.",
		...shellFunction(`${fn}__value_flags`, [
			"reply=()",
			...caseLines(
				"$1",
				specs
					.filter((spec) => spec.flags.some((flag) => flag.takesValue))
					.map((spec) => ({
						pattern: pathPattern(spec),
						body: [
							plain(
								spec.flags
									.filter((flag) => flag.takesValue)
									.flatMap((flag) => flag.tokens),
							),
						],
					})),
				"",
			),
		]),
		"# Fixed values for an enum flag.",
		...shellFunction(`${fn}__flag_values`, [
			"reply=()",
			...caseLines(
				"$1",
				nestedArms(specs, (spec) => flagValueArms(spec, plain)),
				"",
			),
		]),
		"# Fixed values for the Nth positional argument (0-based).",
		...shellFunction(`${fn}__arg_values`, [
			"reply=()",
			...caseLines(
				"$1",
				nestedArms(specs, (spec) => argValueArms(spec, plain)),
				"",
			),
		]),
		...shellFunction(`${fn}__takes_value`, [
			`${fn}__value_flags "$1"`,
			`(( \${reply[(Ie)$2]} ))`,
		]),
		// No `emulate -L zsh` here: it would reset the options compsys's own
		// `_comp_options` set for `_describe` (extended_glob among them).
		...shellFunction(fn, [
			"local cur prev word path='' npos=0 descending=1 resolved i",
			"local -a reply",
			`cur="\${words[CURRENT]}"`,
			"# Walk the words before the cursor down the command tree; flags (and",
			"# their values) are skipped, and the first positional stops the descent.",
			"for ((i = 2; i < CURRENT; i++)); do",
			`\tword="\${words[i]}"`,
			'\tcase "$word" in',
			"\t\t--) descending=0; continue ;;",
			"\t\t--*=*) continue ;;",
			"\t\t-*)",
			`\t\t\tif ${fn}__takes_value "$path" "$word"; then (( i += 1 )); fi`,
			"\t\t\tcontinue",
			"\t\t\t;;",
			"\tesac",
			"\tif (( descending )); then",
			`\t\tresolved="$(${fn}__resolve "$path" "$word")"`,
			'\t\tif [[ -n "$resolved" ]]; then',
			`\t\t\tpath="\${path:+$path }$resolved"`,
			"\t\t\tcontinue",
			"\t\tfi",
			"\t\tdescending=0",
			"\tfi",
			"\t(( npos += 1 ))",
			"done",
			"prev=''",
			`(( CURRENT > 1 )) && prev="\${words[CURRENT - 1]}"`,
			`if [[ "$prev" == -* && "$prev" != --*=* && "$prev" != -- ]] && ${fn}__takes_value "$path" "$prev"; then`,
			`\t${fn}__flag_values "$path" "$prev"`,
			`\tif (( \${#reply} )); then`,
			"\t\t_describe -t values 'value' reply",
			"\telse",
			"\t\t_files",
			"\tfi",
			'elif [[ "$cur" == -* ]]; then',
			`\t${fn}__flags "$path"`,
			"\t_describe -t options 'option' reply",
			"else",
			`\t${fn}__subcommands "$path"`,
			`\tif (( \${#reply} )); then`,
			"\t\t_describe -t commands 'command' reply",
			"\telse",
			`\t\t${fn}__arg_values "$path" "$npos"`,
			`\t\t(( \${#reply} )) && _describe -t values 'value' reply`,
			"\tfi",
			"fi",
		]),
		"if (( ! $+functions[compdef] )); then",
		"\tautoload -Uz compinit && compinit",
		"fi",
		`compdef ${fn} ${binName}`,
		"",
		`# Autoloaded from $fpath, this file is the ${fn} function body itself, so`,
		"# run it; when sourced, only define it.",
		`if [[ "\${funcstack[1]}" == "${fn}" ]]; then`,
		`\t${fn} "$@"`,
		"fi",
		"",
	];
	return lines.join("\n");
}
