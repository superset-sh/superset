import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Broad roots use shallow resource watches rather than a recursive subscription.
 * This selects a performance strategy; these paths remain valid projects.
 */
export type BroadRootReason =
	| "home-directory"
	| "filesystem-root"
	| "contains-superset-home";

export interface RootPolicyEnv {
	homeDir: string;
	supersetHomeDir: string;
}

export function defaultRootPolicyEnv(): RootPolicyEnv {
	const homeDir = os.homedir();
	return {
		homeDir,
		supersetHomeDir:
			process.env.SUPERSET_HOME_DIR?.trim() || path.join(homeDir, ".superset"),
	};
}

function normalize(input: string): string {
	const resolved = path.resolve(input);
	let existing = resolved;
	const missing: string[] = [];
	for (;;) {
		try {
			return path.join(realpathSync.native(existing), ...missing);
		} catch (error) {
			// A configured data directory may not exist yet. Resolve its nearest
			// existing parent so macOS /var aliases and symlinked parents agree.
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") return resolved;
			const parent = path.dirname(existing);
			if (parent === existing) return resolved;
			missing.unshift(path.basename(existing));
			existing = parent;
		}
	}
}

/** Whether `ancestor` strictly contains `descendant`. */
function isAncestorOf(ancestor: string, descendant: string): boolean {
	const relative = path.relative(ancestor, descendant);
	return (
		relative.length > 0 &&
		relative !== ".." &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}

export function broadRootReason(
	rootPath: string,
	env: RootPolicyEnv = defaultRootPolicyEnv(),
): BroadRootReason | null {
	const root = normalize(rootPath);
	if (root === path.parse(root).root) return "filesystem-root";
	if (root === normalize(env.homeDir)) return "home-directory";
	if (isAncestorOf(root, normalize(env.supersetHomeDir))) {
		return "contains-superset-home";
	}
	return null;
}
