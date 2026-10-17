import { pushNotImported } from "./limits";
import { rewriteToolVariables } from "./rewrite-env";
import {
	IMPORTED_SCRIPT_KEYS,
	type ImportedScriptKey,
	type ImportedScriptPlan,
	type ParsedSetupSource,
	type SetupImportCandidate,
} from "./types";

const CONTROL_WORD_START =
	/^(if|then|elif|else|fi|for|while|until|do|done|case|esac|select|function|\{|\}|\(|\))(\s|;|$)/;
// Typed into the user's interactive shell, these outlive the script or close it.
const SHELL_OPTION_START = /^(set|shopt|trap|exit|return)(\s|;|$)/;
const OPEN_LINE_END = /(\\|&|\||;|\{|\(|\bthen|\bdo|\belse|\bin)$/;
const FUNCTION_DEFINITION = /^[A-Za-z_][\w-]*\s*\(\s*\)/;

/**
 * Whether quotes, `$(...)` and backticks close on this line, and whether an
 * unquoted `#` starts a comment.
 */
function scanLine(line: string): { balanced: boolean; hasComment: boolean } {
	let quote: "'" | '"' | null = null;
	let parens = 0;
	let inBacktick = false;
	for (let index = 0; index < line.length; index++) {
		const char = line[index];
		if (quote === "'") {
			if (char === "'") quote = null;
			continue;
		}
		if (char === "\\") {
			index++;
			continue;
		}
		if (char === "`") {
			inBacktick = !inBacktick;
		} else if (char === "$" && line[index + 1] === "(") {
			parens++;
			index++;
		} else if (char === "(" && quote === null) {
			parens++;
		} else if (char === ")" && (quote === null || parens > 0)) {
			if (--parens < 0) return { balanced: false, hasComment: false };
		} else if (char === '"') {
			quote = quote === '"' ? null : '"';
		} else if (quote === null && char === "'") {
			quote = "'";
		} else if (
			quote === null &&
			char === "#" &&
			/\s/.test(line[index - 1] ?? "")
		) {
			return { balanced: true, hasComment: true };
		}
	}
	return {
		balanced: quote === null && parens === 0 && !inBacktick,
		hasComment: false,
	};
}

/**
 * True when the line is a complete command that still means the same thing
 * once Superset joins it to its neighbours with ` && `.
 */
export function isStandaloneCommand(line: string): boolean {
	if (
		CONTROL_WORD_START.test(line) ||
		SHELL_OPTION_START.test(line) ||
		OPEN_LINE_END.test(line) ||
		FUNCTION_DEFINITION.test(line) ||
		line.includes("<<")
	) {
		return false;
	}
	// An inline comment would swallow every command chained after it.
	const { balanced, hasComment } = scanLine(line);
	return balanced && !hasComment;
}

function stripShebang(chunk: string): string {
	return chunk.startsWith("#!") ? chunk.replace(/^#![^\n]*\n?/, "") : chunk;
}

function toCommandLines(chunks: string[]): string[] {
	return chunks
		.flatMap((chunk) => chunk.split(/\r?\n/))
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function getImportedScriptPath(key: ImportedScriptKey): string {
	return `.superset/${key}.sh`;
}

export const IMPORTED_SCRIPT_MARKER = "# Imported by Superset from ";

export function getImportedScriptCommand(key: ImportedScriptKey): string {
	return `bash "$SUPERSET_ROOT_PATH/${getImportedScriptPath(key)}"`;
}

function buildScriptFile(
	key: ImportedScriptKey,
	chunks: string[],
	sourceFiles: string[],
): { path: string; content: string } {
	const body = chunks
		.map((chunk) => stripShebang(chunk).replace(/\r\n/g, "\n").trimEnd())
		.filter((chunk) => chunk.trim().length > 0)
		.join("\n\n");
	return {
		path: getImportedScriptPath(key),
		content: `#!/usr/bin/env bash\n${IMPORTED_SCRIPT_MARKER}${sourceFiles.join(", ")}.\nset -e\n\n${body}\n`,
	};
}

export function planScript(
	key: ImportedScriptKey,
	chunks: string[],
	sourceFiles: string[],
): ImportedScriptPlan | null {
	const lines = toCommandLines(chunks);
	if (lines.length === 0) return null;
	if (lines.every(isStandaloneCommand)) return { commands: lines };
	return {
		commands: [getImportedScriptCommand(key)],
		scriptFile: buildScriptFile(key, chunks, sourceFiles),
	};
}

export function buildCandidate(
	parsed: ParsedSetupSource | null,
): SetupImportCandidate | null {
	if (!parsed) return null;
	const notImported = [...parsed.notImported];
	const scripts: SetupImportCandidate["scripts"] = {};
	for (const key of IMPORTED_SCRIPT_KEYS) {
		const chunks = (parsed.scripts[key] ?? []).map((chunk) => {
			const { script, unsupported } = rewriteToolVariables(chunk);
			for (const name of unsupported) {
				pushNotImported(notImported, {
					file: parsed.files[0] ?? "",
					field: `$${name}`,
					reason: "unsupported-variable",
				});
			}
			return script;
		});
		const plan = planScript(key, chunks, parsed.files);
		if (plan) scripts[key] = plan;
	}
	if (Object.keys(scripts).length === 0 && !parsed.cwd) return null;
	return {
		source: parsed.source,
		label: parsed.label,
		files: parsed.files,
		scripts,
		...(parsed.cwd && { cwd: parsed.cwd }),
		notImported,
	};
}
