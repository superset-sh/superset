import { type CliDescription, type CommandNode, visibleChildren } from "./help";
import type { ProcessedBuilderConfig } from "./option";

// Shell completion scripts generated from the command tree. Options on the
// root node are the globals and are offered at every level. Both scripts
// share one shape: lookup functions keyed by the space-joined command path
// so far ("" at the root), and a main function that walks the words before
// the cursor down the tree, skipping flags and their values.

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

// Anything outside this set would need quoting inside `compgen -W` word
// lists and `case` patterns; such names are dropped rather than quoted.
const SAFE_WORD = /^[A-Za-z0-9@%+=:,./_-]+$/;

function flagToken(name: string): string {
	if (name.startsWith("-")) return name;
	return name.length > 1 ? `--${name}` : `-${name}`;
}

function oneLine(text: string | undefined): string {
	return (text ?? "").replace(/\s+/g, " ").trim();
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

function resolveArms(specs: NodeSpec[]): CaseArm[] {
	return nestedArms(specs, (spec) =>
		spec.subcommands.map((sub) => ({
			pattern: subcommandPattern(sub),
			body: [`echo ${sq(sub.name)}`],
		})),
	);
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

function valueFlagTokens(spec: NodeSpec): string[] {
	return spec.flags.filter((flag) => flag.takesValue).flatMap((f) => f.tokens);
}

function boolFlagTokens(spec: NodeSpec): string[] {
	return spec.flags.filter((flag) => !flag.takesValue).flatMap((f) => f.tokens);
}

/** Lookup table arms: one per path that has any token from `tokens(spec)`. */
function tokenArms(
	specs: NodeSpec[],
	tokens: (spec: NodeSpec) => string[],
	render: (values: string[]) => string,
): CaseArm[] {
	return specs
		.filter((spec) => tokens(spec).length > 0)
		.map((spec) => ({
			pattern: pathPattern(spec),
			body: [render(tokens(spec))],
		}));
}

/**
 * The shared walk: `cmdpath`, `npos`, `descending` and `dashdash` are the
 * caller's locals. A flag's value is skipped whether it follows as one word,
 * as readline's split `=` plus a word, or as a boolean's explicit true/false.
 */
function walkLines(fn: string, firstWord: number, cursor: string): string[] {
	return [
		`for ((i = ${firstWord}; i < ${cursor}; i++)); do`,
		`\tword="\${words[i]}"`,
		"\tif [[ $dashdash -eq 1 ]]; then npos=$((npos + 1)); continue; fi",
		'\tcase "$word" in',
		"\t\t--) dashdash=1; descending=0; continue ;;",
		"\t\t--*=*) continue ;;",
		"\t\t-*)",
		`\t\t\tif ${fn}__takes_value "$cmdpath" "$word"; then`,
		`\t\t\t\tif [[ "\${words[i + 1]}" == "=" ]]; then i=$((i + 2)); else i=$((i + 1)); fi`,
		`\t\t\telif ${fn}__is_bool "$cmdpath" "$word" && (( i + 1 < ${cursor} )); then`,
		`\t\t\t\tif [[ "\${words[i + 1]}" == "=" ]]; then`,
		"\t\t\t\t\ti=$((i + 2))",
		"\t\t\t\telse",
		`\t\t\t\t\tcase "\${words[i + 1]}" in [Tt][Rr][Uu][Ee]|[Ff][Aa][Ll][Ss][Ee]|1|0) i=$((i + 1)) ;; esac`,
		"\t\t\t\tfi",
		"\t\t\tfi",
		"\t\t\tcontinue",
		"\t\t\t;;",
		"\tesac",
		"\tif [[ $descending -eq 1 ]]; then",
		`\t\tresolved="$(${fn}__resolve "$cmdpath" "$word")"`,
		'\t\tif [[ -n "$resolved" ]]; then',
		`\t\t\tcmdpath="\${cmdpath:+$cmdpath }$resolved"`,
		"\t\t\tcontinue",
		"\t\tfi",
		"\t\tdescending=0",
		"\tfi",
		"\tnpos=$((npos + 1))",
		"done",
	];
}

/** `name path token` succeeds when `listFn path` lists the token. */
function bashMembership(name: string, listFn: string): string[] {
	return shellFunction(name, [
		"local f",
		`for f in $(${listFn} "$1"); do`,
		'\t[[ "$f" == "$2" ]] && return 0',
		"done",
		"return 1",
	]);
}

const PREV_TAKES_VALUE = (fn: string) =>
	`if [[ "$prev" == -* && "$prev" != --*=* && "$prev" != -- ]] && ${fn}__takes_value "$cmdpath" "$prev"; then`;

export function generateBashCompletion({ name, root }: CliDescription): string {
	const specs = collectSpecs(root);
	const fn = `_${shellIdentifier(name)}`;
	const echo = (words: string[]) => `echo ${sq(words.join(" "))}`;

	const lines: string[] = [
		`# ${name} bash completion, generated by \`${name} completion bash\`.`,
		`# Load with: source <(${name} completion bash)`,
		"",
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
		...shellFunction(`${fn}__resolve`, caseLines("$1", resolveArms(specs), "")),
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
		...shellFunction(
			`${fn}__value_flags`,
			caseLines("$1", tokenArms(specs, valueFlagTokens, echo), ""),
		),
		...shellFunction(
			`${fn}__bool_flags`,
			caseLines("$1", tokenArms(specs, boolFlagTokens, echo), ""),
		),
		...shellFunction(
			`${fn}__flag_values`,
			caseLines(
				"$1",
				nestedArms(specs, (spec) => flagValueArms(spec, echo)),
				"",
			),
		),
		...shellFunction(
			`${fn}__arg_values`,
			caseLines(
				"$1",
				nestedArms(specs, (spec) => argValueArms(spec, echo)),
				"",
			),
		),
		...bashMembership(`${fn}__takes_value`, `${fn}__value_flags`),
		...bashMembership(`${fn}__is_bool`, `${fn}__bool_flags`),
		...shellFunction(fn, [
			"local cur prev word flag eqprefix candidates cmdpath='' npos=0 descending=1 dashdash=0 resolved i",
			`local -a words=("\${COMP_WORDS[@]}")`,
			"COMPREPLY=()",
			`cur="\${COMP_WORDS[COMP_CWORD]}"`,
			...walkLines(fn, 1, "COMP_CWORD"),
			"prev=''",
			`if [[ $COMP_CWORD -gt 0 ]]; then prev="\${COMP_WORDS[COMP_CWORD - 1]}"; fi`,
			"# After --, every word is positional.",
			"if [[ $dashdash -eq 1 ]]; then",
			`\tcandidates="$(${fn}__arg_values "$cmdpath" "$npos")"`,
			'\tif [[ -z "$candidates" ]]; then',
			"\t\ttype compopt >/dev/null 2>&1 && compopt -o default 2>/dev/null",
			"\t\treturn 0",
			"\tfi",
			'\tCOMPREPLY=($(compgen -W "$candidates" -- "$cur"))',
			"\treturn 0",
			"fi",
			'if [[ "$cur" == --*=* ]]; then',
			`\tflag="\${cur%%=*}"`,
			"\t# bash 3 hands over the unsplit word while readline still replaces only",
			'\t# the part after "=" when "=" is a word break; newer bash with "=" removed',
			"\t# from COMP_WORDBREAKS replaces the whole word.",
			'\teqprefix="$flag="',
			`\t[[ "$COMP_WORDBREAKS" == *=* ]] && eqprefix=''`,
			`\tif ${fn}__is_bool "$cmdpath" "$flag"; then`,
			`\t\tCOMPREPLY=($(compgen -W 'false true' -P "$eqprefix" -- "\${cur#*=}"))`,
			`\telif ${fn}__takes_value "$cmdpath" "$flag"; then`,
			`\t\tcandidates="$(${fn}__flag_values "$cmdpath" "$flag")"`,
			'\t\tif [[ -n "$candidates" ]]; then',
			`\t\t\tCOMPREPLY=($(compgen -W "$candidates" -P "$eqprefix" -- "\${cur#*=}"))`,
			'\t\telif [[ -n "$eqprefix" ]]; then',
			`\t\t\tCOMPREPLY=($(compgen -f -P "$eqprefix" -- "\${cur#*=}"))`,
			"\t\tfi",
			"\t\t# Otherwise readline's own filename completion of the text after",
			'\t\t# "=" takes over (see the registration below).',
			"\tfi",
			"\treturn 0",
			"fi",

			'# Readline splits --flag=value at "=" (COMP_WORDBREAKS), so the flag sits',
			"# one or two words back.",
			'if [[ "$cur" == "=" && "$prev" == --* ]]; then',
			'\tflag="$prev"',
			`elif [[ "$prev" == "=" && $COMP_CWORD -ge 2 && "\${COMP_WORDS[COMP_CWORD - 2]}" == --* ]]; then`,
			`\tflag="\${COMP_WORDS[COMP_CWORD - 2]}"`,
			"else",
			"\tflag=''",
			"fi",
			'if [[ -n "$flag" ]]; then',
			'\t[[ "$cur" == "=" ]] && cur=\'\'',
			`\tif ${fn}__is_bool "$cmdpath" "$flag"; then`,
			`\t\tCOMPREPLY=($(compgen -W 'false true' -- "$cur"))`,
			`\telif ${fn}__takes_value "$cmdpath" "$flag"; then`,
			`\t\tcandidates="$(${fn}__flag_values "$cmdpath" "$flag")"`,
			'\t\tif [[ -z "$candidates" ]]; then',
			"\t\t\ttype compopt >/dev/null 2>&1 && compopt -o default 2>/dev/null",
			"\t\t\treturn 0",
			"\t\tfi",
			'\t\tCOMPREPLY=($(compgen -W "$candidates" -- "$cur"))',
			"\tfi",
			"\treturn 0",
			"fi",
			PREV_TAKES_VALUE(fn),
			`\tcandidates="$(${fn}__flag_values "$cmdpath" "$prev")"`,
			'\tif [[ -z "$candidates" ]]; then',
			"\t\t# Free-form value: let readline offer filenames.",
			"\t\ttype compopt >/dev/null 2>&1 && compopt -o default 2>/dev/null",
			"\t\treturn 0",
			"\tfi",
			'elif [[ "$cur" == -* ]]; then',
			`\tcandidates="$(${fn}__flags "$cmdpath")"`,
			"else",
			`\tcandidates="$(${fn}__subcommands "$cmdpath")"`,
			'\tif [[ -z "$candidates" ]]; then',
			`\t\tcandidates="$(${fn}__arg_values "$cmdpath" "$npos")"`,
			"\tfi",
			"fi",
			'COMPREPLY=($(compgen -W "$candidates" -- "$cur"))',
		]),
		"# Without compopt (bash 3), -o default lets readline complete filenames,",
		"# with its own quoting and trailing slashes, whenever nothing was offered.",
		"if type compopt >/dev/null 2>&1; then",
		`\tcomplete -F ${fn} ${name}`,
		"else",
		`\tcomplete -o default -F ${fn} ${name}`,
		"fi",
		"",
	];
	return lines.join("\n");
}

export function generateZshCompletion({ name, root }: CliDescription): string {
	const specs = collectSpecs(root);
	const fn = `_${shellIdentifier(name)}`;
	// `_describe` splits each entry on its first unescaped colon.
	const entry = (word: string, description: string) =>
		sq(
			description
				? `${word.replace(/:/g, "\\:")}:${description.replace(/:/g, "\\:")}`
				: word.replace(/:/g, "\\:"),
		);
	const reply = (entries: string[]) => `reply=(${entries.join(" ")})`;
	const plain = (values: string[]) => reply(values.map((v) => entry(v, "")));
	const replyFunction = (fnName: string, arms: CaseArm[]) =>
		shellFunction(fnName, ["reply=()", ...caseLines("$1", arms, "")]);

	const lines: string[] = [
		`#compdef ${name}`,
		`# ${name} zsh completion, generated by \`${name} completion zsh\`.`,
		`# Load with: source <(${name} completion zsh)`,
		`# Or install it on your fpath as _${name} and run compinit.`,
		"",
		...replyFunction(
			`${fn}__subcommands`,
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
		),
		...shellFunction(`${fn}__resolve`, caseLines("$1", resolveArms(specs), "")),
		...replyFunction(
			`${fn}__flags`,
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
		),
		...replyFunction(
			`${fn}__value_flags`,
			tokenArms(specs, valueFlagTokens, plain),
		),
		...replyFunction(
			`${fn}__bool_flags`,
			tokenArms(specs, boolFlagTokens, plain),
		),
		...replyFunction(
			`${fn}__flag_values`,
			nestedArms(specs, (spec) => flagValueArms(spec, plain)),
		),
		...replyFunction(
			`${fn}__arg_values`,
			nestedArms(specs, (spec) => argValueArms(spec, plain)),
		),
		...shellFunction(`${fn}__takes_value`, [
			`${fn}__value_flags "$1"`,
			`(( \${reply[(Ie)$2]} ))`,
		]),
		...shellFunction(`${fn}__is_bool`, [
			`${fn}__bool_flags "$1"`,
			`(( \${reply[(Ie)$2]} ))`,
		]),
		// No `emulate -L zsh` here: it would reset the options compsys sets
		// for `_describe` (extended_glob among them).
		...shellFunction(fn, [
			"local cur prev word flag cmdpath='' npos=0 descending=1 dashdash=0 resolved i",
			"local -a reply",
			`cur="\${words[CURRENT]}"`,
			...walkLines(fn, 2, "CURRENT"),
			"prev=''",
			`(( CURRENT > 1 )) && prev="\${words[CURRENT - 1]}"`,
			"# After --, every word is positional.",
			"if (( dashdash )); then",
			`\t${fn}__arg_values "$cmdpath" "$npos"`,
			`\tif (( \${#reply} )); then _describe -t values 'value' reply; else _files; fi`,
			"\treturn",
			"fi",
			'if [[ "$cur" == --*=* ]]; then',
			`\tflag="\${cur%%=*}"`,
			"\tcompset -P '*='",
			`\tif ${fn}__is_bool "$cmdpath" "$flag"; then`,
			"\t\treply=('false' 'true')",
			"\t\t_describe -t values 'value' reply",
			`\telif ${fn}__takes_value "$cmdpath" "$flag"; then`,
			`\t\t${fn}__flag_values "$cmdpath" "$flag"`,
			`\t\tif (( \${#reply} )); then _describe -t values 'value' reply; else _files; fi`,
			"\tfi",
			"\treturn",
			"fi",
			PREV_TAKES_VALUE(fn),
			`\t${fn}__flag_values "$cmdpath" "$prev"`,
			`\tif (( \${#reply} )); then`,
			"\t\t_describe -t values 'value' reply",
			"\telse",
			"\t\t_files",
			"\tfi",
			'elif [[ "$cur" == -* ]]; then',
			`\t${fn}__flags "$cmdpath"`,
			"\t_describe -t options 'option' reply",
			"else",
			`\t${fn}__subcommands "$cmdpath"`,
			`\tif (( \${#reply} )); then`,
			"\t\t_describe -t commands 'command' reply",
			"\telse",
			`\t\t${fn}__arg_values "$cmdpath" "$npos"`,
			`\t\t(( \${#reply} )) && _describe -t values 'value' reply`,
			"\tfi",
			"fi",
		]),
		"if (( ! $+functions[compdef] )); then",
		"\tautoload -Uz compinit && compinit",
		"fi",
		`compdef ${fn} ${name}`,
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
