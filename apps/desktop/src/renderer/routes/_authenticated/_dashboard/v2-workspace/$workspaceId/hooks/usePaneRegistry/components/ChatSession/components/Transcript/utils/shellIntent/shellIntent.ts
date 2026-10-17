import type { ToolCall, ToolKind } from "@superset/chat/protocol";

export type ShellVerb = "read" | "search" | "list" | "write" | "edit";

export type ShellIntent = {
	verb: ShellVerb;
	path?: string;
	query?: string;
	startLine?: number;
	/** Where the command ran, when the agent said; `path` stays as typed. */
	cwd?: string;
};

/** The path to open: `path` resolved against where the command ran. */
export function intentLocation(intent: ShellIntent): string | undefined {
	if (!intent.path) return undefined;
	return intent.cwd ? joinPath(intent.cwd, intent.path) : intent.path;
}

/** A script this long is a program, not a glance at a file. */
const MAX_COMMAND_CHARS = 2000;

const READ_BINS = new Set([
	"cat",
	"bat",
	"batcat",
	"nl",
	"less",
	"more",
	"tac",
]);
const SEARCH_BINS = new Set([
	"grep",
	"egrep",
	"fgrep",
	"rgrep",
	"rg",
	"ag",
	"ack",
]);
const LIST_BINS = new Set(["ls", "tree"]);
const NOISE_BINS = new Set([
	"cd",
	"echo",
	"printf",
	"pwd",
	"true",
	"false",
	"clear",
	":",
	"wc",
	"sleep",
	"export",
	"unset",
	"alias",
	"wait",
	"sort",
	"uniq",
	"cut",
	"tr",
	"xargs",
]);

const GREP_VALUE_FLAGS = new Set([
	"-e",
	"--regexp",
	"-f",
	"--file",
	"-A",
	"--after-context",
	"-B",
	"--before-context",
	"-C",
	"--context",
	"-m",
	"--max-count",
	"-d",
	"--directories",
	"-D",
	"--devices",
	"--include",
	"--exclude",
	"--exclude-dir",
	"-g",
	"--glob",
	"-t",
	"--type",
	"-T",
	"--type-not",
	"-j",
	"--threads",
	"--max-filesize",
	"--max-depth",
	"--max-columns",
]);

const FIND_VALUE_FLAGS = new Set([
	"-name",
	"-iname",
	"-path",
	"-ipath",
	"-wholename",
	"-iwholename",
	"-regex",
	"-iregex",
	"-type",
	"-mtime",
	"-mmin",
	"-ctime",
	"-cmin",
	"-atime",
	"-amin",
	"-size",
	"-maxdepth",
	"-mindepth",
	"-user",
	"-group",
	"-perm",
	"-exec",
	"-execdir",
	"-ok",
	"-printf",
	"-newer",
]);

const SHELL_WRAPPERS = [
	{
		executables: new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]),
		commandFlag: /^(?:--command|-[a-z]*c[a-z]*)$/i,
		optionBoundary: null,
		consumeRemainder: false,
	},
	{
		executables: new Set(["powershell", "powershell.exe", "pwsh", "pwsh.exe"]),
		commandFlag: /^-(?:command|c)$/i,
		optionBoundary: /^-(?:file|f)$/i,
		consumeRemainder: true,
	},
	{
		executables: new Set(["cmd", "cmd.exe"]),
		commandFlag: /^\/c$/i,
		optionBoundary: null,
		consumeRemainder: true,
	},
];

type Token = { value: string; start: number; end: number };
type Classified = ShellIntent | "noise" | "opaque";

/**
 * What a shell command amounts to when that is obvious: `cat`, `sed -n` and
 * `head` read a file, `grep` and `rg` search, `ls` lists, a redirect writes.
 * Anything with substitution, a program of its own, or an unknown binary
 * stays a command and returns null.
 */
export function inferShellIntent(command: string): ShellIntent | null {
	const text = unwrapShellCommand(command);
	if (!text || text.length > MAX_COMMAND_CHARS) return null;
	if (hasSubstitution(text)) return null;

	const intents: ShellIntent[] = [];
	let redirect: ShellIntent | undefined;
	let directory = "";
	for (const chain of splitTopLevel(text, chainSeparator)) {
		const write = writeRedirect(chain);
		if (write) {
			redirect = {
				verb: write.append ? "edit" : "write",
				path: joinPath(directory, write.path),
			};
		}
		let last: ShellIntent | undefined;
		for (const stage of splitTopLevel(chain, pipeSeparator)) {
			const tokens = tokenize(withoutRedirects(stage));
			if (!tokens || tokens.length === 0) return null;
			const argv = tokens.map((token) => token.value);
			if (binName(argv[0] ?? "") === "cd") {
				directory = joinPath(directory, tidyPath(argv[1]) ?? "");
				continue;
			}
			const classified = classify(argv);
			if (classified === "opaque") return null;
			if (classified === "noise") continue;
			last = classified.path
				? { ...classified, path: joinPath(directory, classified.path) }
				: classified;
		}
		if (last) intents.push(last);
	}

	if (redirect) return redirect;
	if (intents.length === 0) return null;
	const latest = [...intents].reverse();
	return (
		latest.find(
			(intent) => intent.verb === "write" || intent.verb === "edit",
		) ??
		latest.find(
			(intent) => intent.verb === "read" || intent.verb === "search",
		) ??
		latest[0] ??
		null
	);
}

/**
 * The script inside `/bin/zsh -lc "..."` or `pwsh -Command ...`: some agents
 * report the shell they launched rather than what they asked it to run.
 */
export function unwrapShellCommand(command: string): string {
	let current = command.trim();
	for (let depth = 0; depth < 2; depth += 1) {
		const tokens = tokenize(current);
		if (!tokens || tokens.length < 3) break;
		const first = tokens[0];
		if (!first) break;
		const wrapper = SHELL_WRAPPERS.find((candidate) =>
			candidate.executables.has(binName(first.value)),
		);
		if (!wrapper) break;
		let flagIndex = -1;
		for (let index = 1; index < tokens.length; index += 1) {
			const value = tokens[index]?.value ?? "";
			if (wrapper.optionBoundary?.test(value)) break;
			if (wrapper.commandFlag.test(value)) {
				flagIndex = index;
				break;
			}
		}
		const scriptToken = flagIndex === -1 ? undefined : tokens[flagIndex + 1];
		if (!scriptToken) break;
		const quote = current[scriptToken.start];
		const soleQuotedScript =
			(quote === '"' || quote === "'") &&
			current[scriptToken.end - 1] === quote &&
			tokens.length === flagIndex + 2;
		const script =
			wrapper.consumeRemainder && !soleQuotedScript
				? current.slice(scriptToken.start).trim()
				: scriptToken.value.trim();
		if (!script || script === current) break;
		current = script;
	}
	return current;
}

/** The command an execute call ran, from wherever the harness put it. */
export function toolCallCommand(item: ToolCall): string | null {
	const raw = item.rawInput;
	if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
		const command = (raw as Record<string, unknown>).command;
		if (typeof command === "string" && command.trim()) return command;
	}
	for (const content of item.content) {
		if (content.type === "terminal" && content.command.trim()) {
			return content.command;
		}
	}
	return null;
}

export function toolCallIntent(item: ToolCall): ShellIntent | null {
	if (item.toolKind !== "execute") return null;
	const command = toolCallCommand(item);
	const intent = command ? inferShellIntent(command) : null;
	const raw = item.rawInput;
	const cwd =
		typeof raw === "object" && raw !== null && !Array.isArray(raw)
			? (raw as Record<string, unknown>).cwd
			: undefined;
	return intent && typeof cwd === "string" && cwd ? { ...intent, cwd } : intent;
}

/** The kind a reader would file the call under, once a shell verb is known. */
export function effectiveToolKind(item: ToolCall): ToolKind {
	const intent = toolCallIntent(item);
	if (!intent) return item.toolKind;
	switch (intent.verb) {
		case "read":
			return "read";
		case "search":
		case "list":
			return "search";
		case "write":
		case "edit":
			return "edit";
	}
}

function classify(argv: string[]): Classified {
	const bin = binName(argv[0] ?? "");
	if (NOISE_BINS.has(bin)) return "noise";
	if (READ_BINS.has(bin)) return readIntent(argv);
	if (bin === "head" || bin === "tail") return headTailIntent(argv);
	if (bin === "sed") return sedIntent(argv);
	if (bin === "tee") return teeIntent(argv);
	if (bin === "rg" && argv.includes("--files")) {
		return { verb: "search", query: "files" };
	}
	if (SEARCH_BINS.has(bin)) return grepIntent(argv);
	if (bin === "find") return findIntent(argv);
	if (bin === "fd" || bin === "fdfind") return fdIntent(argv);
	if (LIST_BINS.has(bin)) return listIntent(argv);
	return "opaque";
}

function readIntent(argv: string[]): Classified {
	const path = lastPath(positionals(argv, new Set()));
	return path ? { verb: "read", path } : "noise";
}

function headTailIntent(argv: string[]): Classified {
	const files: string[] = [];
	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		if (arg === "--") {
			files.push(...argv.slice(index + 1));
			break;
		}
		if (
			arg === "-n" ||
			arg === "-c" ||
			arg === "--lines" ||
			arg === "--bytes"
		) {
			index += 1;
			continue;
		}
		if (arg.startsWith("-") && arg !== "-") continue;
		files.push(arg);
	}
	const path = lastPath(files);
	return path ? { verb: "read", path } : "noise";
}

function sedIntent(argv: string[]): Classified {
	if (argv.some(isSedInPlace)) {
		const path = lastSourcePath(argv.slice(1));
		return path ? { verb: "edit", path } : "opaque";
	}
	let script: string | undefined;
	const files: string[] = [];
	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		if (arg === "--") {
			files.push(...argv.slice(index + 1));
			break;
		}
		if (arg === "-e" || arg === "--expression") {
			script = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg === "-f" || arg === "--file") return "opaque";
		if (arg.startsWith("-") && arg !== "-") continue;
		if (script === undefined) script = arg;
		else files.push(arg);
	}
	const path = lastPath(files);
	if (!path) return "noise";
	const startLine = script?.match(/^(\d+)(?:,\d+)?p$/)?.[1];
	return {
		verb: "read",
		path,
		...(startLine && Number(startLine) > 0
			? { startLine: Number(startLine) }
			: {}),
	};
}

function teeIntent(argv: string[]): Classified {
	const append = argv.includes("-a") || argv.includes("--append");
	const path = lastPath(positionals(argv, new Set()));
	if (!path) return "opaque";
	return { verb: append ? "edit" : "write", path };
}

function grepIntent(argv: string[]): Classified {
	let query: string | undefined;
	const files: string[] = [];
	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		if (arg === "--") {
			const rest = argv.slice(index + 1);
			if (query === undefined && rest[0] !== undefined) {
				query = rest[0];
				files.push(...rest.slice(1));
			} else {
				files.push(...rest);
			}
			break;
		}
		if (arg === "-e" || arg === "--regexp") {
			query = argv[index + 1];
			index += 1;
			continue;
		}
		if (GREP_VALUE_FLAGS.has(arg)) {
			index += 1;
			continue;
		}
		if (arg.startsWith("-") && arg !== "-") {
			if (arg.startsWith("-e") && arg.length > 2) query = arg.slice(2);
			continue;
		}
		if (query === undefined) query = arg;
		else files.push(arg);
	}
	if (!query) return "opaque";
	const path = lastPath(files);
	return { verb: "search", query, ...(path ? { path } : {}) };
}

/** `find` actions that run or change something, not just list matches. */
const FIND_ACTIONS = new Set([
	"-delete",
	"-exec",
	"-execdir",
	"-ok",
	"-okdir",
	"-fprint",
	"-fprint0",
	"-fprintf",
	"-fls",
]);

function findIntent(argv: string[]): Classified {
	if (argv.some((arg) => FIND_ACTIONS.has(arg))) return "opaque";
	let query: string | undefined;
	let path: string | undefined;
	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		if (
			arg === "-name" ||
			arg === "-iname" ||
			arg === "-path" ||
			arg === "-ipath"
		) {
			query = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			if (FIND_VALUE_FLAGS.has(arg)) index += 1;
			continue;
		}
		if (path === undefined) path = tidyPath(arg);
	}
	if (!query) return "opaque";
	return { verb: "search", query, ...(path ? { path } : {}) };
}

const FD_VALUE_FLAGS = new Set([
	"-e",
	"--extension",
	"-t",
	"--type",
	"-E",
	"--exclude",
	"-d",
	"--max-depth",
	"--min-depth",
	"--exact-depth",
	"-x",
	"--exec",
	"-X",
	"--exec-batch",
	"-S",
	"--size",
	"-o",
	"--owner",
	"--changed-within",
	"--changed-before",
	"-j",
	"--threads",
	"--base-directory",
	"--search-path",
]);

function fdIntent(argv: string[]): Classified {
	const [query, ...paths] = positionals(argv, FD_VALUE_FLAGS);
	if (!query) return "opaque";
	const path = lastPath(paths);
	return { verb: "search", query, ...(path ? { path } : {}) };
}

function listIntent(argv: string[]): Classified {
	const path = lastPath(
		positionals(argv, new Set(["--ignore", "-I", "--hide"])),
	);
	return path ? { verb: "list", path } : "noise";
}

function positionals(argv: string[], valueFlags: Set<string>): string[] {
	const out: string[] = [];
	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		if (arg === "--") {
			out.push(...argv.slice(index + 1));
			break;
		}
		if (arg.startsWith("-") && arg !== "-") {
			if (valueFlags.has(arg)) index += 1;
			continue;
		}
		out.push(arg);
	}
	return out;
}

function lastPath(values: string[]): string | undefined {
	for (let index = values.length - 1; index >= 0; index -= 1) {
		const path = tidyPath(values[index]);
		if (path) return path;
	}
	return undefined;
}

function lastSourcePath(args: string[]): string | undefined {
	for (let index = args.length - 1; index >= 0; index -= 1) {
		const arg = args[index];
		if (!arg || (arg.startsWith("-") && arg !== "-")) continue;
		if (/^\d+(,\d+)?[spd]$/.test(arg) || /^s([^A-Za-z0-9]).+\1/.test(arg)) {
			continue;
		}
		const path = tidyPath(arg);
		if (path) return path;
	}
	return undefined;
}

function isSedInPlace(arg: string): boolean {
	return (
		arg === "--in-place" ||
		arg.startsWith("-i") ||
		arg.startsWith("--in-place=")
	);
}

function tidyPath(value: string | undefined): string | undefined {
	if (!value || value === "-" || value.includes(">") || value.includes("<")) {
		return undefined;
	}
	const trimmed = value.replace(/\\/g, "/").replace(/\/+$/, "");
	if (
		!trimmed ||
		trimmed === "." ||
		trimmed === "/dev/null" ||
		trimmed === "/dev/stdin" ||
		trimmed === "/dev/stdout" ||
		/^\d+$/.test(trimmed)
	) {
		return undefined;
	}
	return trimmed;
}

/** `cd src` then `cat index.ts` read `src/index.ts`; an absolute path stands alone. */
function joinPath(directory: string, path: string): string {
	if (!directory || !path || /^(?:[a-zA-Z]:)?[/~]/.test(path)) return path;
	const root = directory.startsWith("/") ? "/" : "";
	const parts = `${directory}/${path}`.split("/");
	const out: string[] = [];
	for (const part of parts) {
		if (part === "" || part === ".") continue;
		if (part === ".." && out.length > 0 && out.at(-1) !== "..") out.pop();
		else out.push(part);
	}
	return root + out.join("/");
}

function binName(token: string): string {
	return (token.replace(/\\/g, "/").split("/").pop() ?? token).toLowerCase();
}

/**
 * Backticks and `$(…)` run something the text does not show. Only single
 * quotes stop them; inside double quotes the shell still runs them.
 */
function hasSubstitution(command: string): boolean {
	let quote: "'" | '"' | null = null;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		if (quote === "'") {
			if (char === "'") quote = null;
			continue;
		}
		if (quote === '"') {
			if (char === "\\") index += 1;
			else if (char === '"') quote = null;
			else if (
				char === "`" ||
				(char === "$" &&
					(command[index + 1] === "(" || command[index + 1] === "{"))
			) {
				return true;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (char === "\\") {
			index += 1;
			continue;
		}
		if (char === "`") return true;
		if (
			char === "$" &&
			(command[index + 1] === "(" || command[index + 1] === "{")
		) {
			return true;
		}
	}
	return quote !== null;
}

function writeRedirect(
	command: string,
): { path: string; append: boolean } | undefined {
	let quote: "'" | '"' | null = null;
	let found: { path: string; append: boolean } | undefined;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		if (quote) {
			if (quote === '"' && char === "\\") index += 1;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (char === "\\") {
			index += 1;
			continue;
		}
		if (char !== ">") continue;
		// `2>` and friends redirect another stream; only stdout is the output.
		const fd = command[index - 1];
		if (
			fd !== undefined &&
			/\d/.test(fd) &&
			fd !== "1" &&
			/^\s?$/.test(command[index - 2] ?? "")
		) {
			continue;
		}
		let append = false;
		let cursor = index + 1;
		if (command[cursor] === ">") {
			append = true;
			cursor += 1;
		}
		while (command[cursor] === " " || command[cursor] === "\t") cursor += 1;
		if (command[cursor] === "&") continue;
		const word = readWord(command, cursor);
		if (!word) continue;
		const path = tidyPath(word.value);
		if (path) found = { path, append };
		index = Math.max(index, word.end - 1);
	}
	return found;
}

/**
 * The stage without its redirections (`2> err.log`, `< in.txt`, `2>&1`),
 * so a redirect's target is never read as one of the command's arguments.
 */
function withoutRedirects(stage: string): string {
	let out = "";
	let quote: "'" | '"' | null = null;
	for (let index = 0; index < stage.length; index += 1) {
		const char = stage[index] ?? "";
		if (quote) {
			if (quote === '"' && char === "\\") {
				out += char + (stage[index + 1] ?? "");
				index += 1;
				continue;
			}
			if (char === quote) quote = null;
			out += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			out += char;
			continue;
		}
		if (char === "\\") {
			out += char + (stage[index + 1] ?? "");
			index += 1;
			continue;
		}
		if (char !== ">" && char !== "<") {
			out += char;
			continue;
		}
		// A file-descriptor number right before the operator belongs to it.
		out = out.replace(/(^|\s)\d+$/, "$1");
		let cursor = index + 1;
		while (stage[cursor] === ">" || stage[cursor] === "<") cursor += 1;
		if (stage[cursor] === "&") {
			cursor += 1;
			while (/[\d-]/.test(stage[cursor] ?? "")) cursor += 1;
			index = cursor - 1;
			out += " ";
			continue;
		}
		while (stage[cursor] === " " || stage[cursor] === "\t") cursor += 1;
		const word = readWord(stage, cursor);
		index = (word ? word.end : cursor) - 1;
		out += " ";
	}
	return out;
}

/** One shell word from `start`, with its quotes and escapes resolved. */
function readWord(
	text: string,
	start: number,
): { value: string; end: number } | null {
	const tokens = tokenize(text.slice(start));
	const first = tokens?.[0];
	if (!first || first.start !== 0) return null;
	return { value: first.value, end: start + first.end };
}

function chainSeparator(text: string, index: number): number {
	if (text.startsWith("&&", index) || text.startsWith("||", index)) return 2;
	if (text.startsWith("\r\n", index)) return 2;
	const char = text[index];
	return char === "\n" || char === "\r" || char === ";" ? 1 : 0;
}

function pipeSeparator(text: string, index: number): number {
	return text[index] === "|" && text[index + 1] !== "|" ? 1 : 0;
}

function splitTopLevel(
	command: string,
	separatorAt: (text: string, index: number) => number,
): string[] {
	const parts: string[] = [];
	let start = 0;
	let quote: "'" | '"' | null = null;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		if (quote) {
			if (quote === '"' && char === "\\") index += 1;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (char === "\\") {
			index += 1;
			continue;
		}
		const length = separatorAt(command, index);
		if (length > 0) {
			const part = command.slice(start, index).trim();
			if (part) parts.push(part);
			index += length - 1;
			start = index + 1;
		}
	}
	const tail = command.slice(start).trim();
	if (tail) parts.push(tail);
	return parts;
}

/** Null when a quote never closes. Redirect operators split tokens like spaces. */
function tokenize(stage: string): Token[] | null {
	const tokens: Token[] = [];
	let index = 0;
	while (index < stage.length) {
		while (index < stage.length && /[ \t|&;<>()]/.test(stage[index] ?? "")) {
			index += 1;
		}
		if (index >= stage.length) break;
		if (stage[index] === "#") break;
		const start = index;
		let value = "";
		while (index < stage.length && !/[ \t|&;<>()]/.test(stage[index] ?? "")) {
			const char = stage[index];
			if (char === "'") {
				const end = stage.indexOf("'", index + 1);
				if (end === -1) return null;
				value += stage.slice(index + 1, end);
				index = end + 1;
				continue;
			}
			if (char === '"') {
				index += 1;
				while (index < stage.length && stage[index] !== '"') {
					if (
						stage[index] === "\\" &&
						index + 1 < stage.length &&
						'$`"\\\n'.includes(stage[index + 1] ?? "")
					) {
						value += stage[index + 1];
						index += 2;
						continue;
					}
					value += stage[index];
					index += 1;
				}
				if (index >= stage.length) return null;
				index += 1;
				continue;
			}
			if (char === "\\" && index + 1 < stage.length) {
				value += stage[index + 1];
				index += 2;
				continue;
			}
			value += char;
			index += 1;
		}
		if (value) tokens.push({ value, start, end: index });
		if (index <= start) index += 1;
	}
	return tokens;
}
