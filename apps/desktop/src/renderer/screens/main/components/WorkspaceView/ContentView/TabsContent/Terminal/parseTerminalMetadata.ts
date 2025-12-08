/**
 * Parses terminal output for metadata like current working directory and virtual environment.
 *
 * OSC 7 format: ESC]7;file://hostname/path BEL (or ESC\)
 * Virtual env patterns: (venv), (base), (.venv), (myenv), [nix-shell], etc.
 */

const ESC = "\x1b";
const BEL = "\x07";

/**
 * OSC 7 pattern for current working directory.
 * Format: ESC]7;file://hostname/path (terminated by BEL or ESC\)
 */
const OSC7_PATTERN = new RegExp(
	`${ESC}\\]7;file://[^/]*((?:/[^${BEL}${ESC}]*)*)(?:${BEL}|${ESC}\\\\)`,
	"g",
);

/**
 * Pattern for virtual environment names in shell prompts.
 * Matches: (venv), (base), (.venv), (myenv), (conda-env), [nix-shell], etc.
 * More permissive pattern that matches parentheses/brackets followed by space or at line boundaries.
 */
const VENV_PATTERN = /(\([^()]+\)|\[[^[\]]+\])\s/g;

/**
 * Known virtual environment prefixes/patterns to identify venv-like entries.
 */
const VENV_INDICATORS = [
	// Python virtualenvs
	"venv",
	".venv",
	"env",
	".env",
	"virtualenv",
	// Conda
	"base",
	"conda",
	// Nix
	"nix-shell",
	// Poetry
	"poetry",
	// Pipenv
	"pipenv",
	// Node version managers
	"nvm",
	"fnm",
	// Ruby
	"rvm",
	"rbenv",
	// Generic patterns
	"-env",
	"_env",
	"-venv",
	"_venv",
];

export interface TerminalMetadata {
	cwd: string | null;
	venv: string | null;
}

/**
 * Extracts the current working directory from OSC 7 escape sequences.
 * Returns the last (most recent) directory found in the data.
 */
export function parseOsc7Cwd(data: string): string | null {
	let lastCwd: string | null = null;

	for (const match of data.matchAll(OSC7_PATTERN)) {
		const path = match[1];
		if (path) {
			// URL decode the path
			try {
				lastCwd = decodeURIComponent(path);
			} catch {
				lastCwd = path;
			}
		}
	}

	return lastCwd;
}

/**
 * Checks if a bracketed name looks like a virtual environment indicator.
 */
function isVenvLikeName(name: string): boolean {
	const lower = name.toLowerCase();

	// Check for known indicators
	for (const indicator of VENV_INDICATORS) {
		if (lower.includes(indicator)) {
			return true;
		}
	}

	// Check for common virtual environment naming patterns:
	// - Single word that looks like an env name (short, no spaces)
	// - Contains "py" or "python" (e.g., py310, python3)
	if (lower.includes("py") || lower.includes("python")) {
		return true;
	}

	// If it's in parentheses and relatively short, it's likely an env
	// (shell prompts usually don't have long parenthetical content)
	if (name.length <= 20 && !name.includes(" ")) {
		return true;
	}

	return false;
}

/**
 * Extracts virtual environment name from terminal output.
 * Looks for patterns like (venv), (base), [nix-shell], etc.
 * Returns the last (most recent) venv found in the data.
 */
export function parseVenv(data: string): string | null {
	let lastVenv: string | null = null;

	for (const match of data.matchAll(VENV_PATTERN)) {
		const fullMatch = match[1]; // e.g., "(venv)" or "[nix-shell]"
		// Extract the name without brackets
		const name = fullMatch.slice(1, -1);

		if (isVenvLikeName(name)) {
			lastVenv = name;
		}
	}

	return lastVenv;
}

/**
 * Parse terminal data for metadata updates.
 * Combines OSC 7 cwd parsing and venv detection.
 */
export function parseTerminalMetadata(data: string): TerminalMetadata {
	return {
		cwd: parseOsc7Cwd(data),
		venv: parseVenv(data),
	};
}
