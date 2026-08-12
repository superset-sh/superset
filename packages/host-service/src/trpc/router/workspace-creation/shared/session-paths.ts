import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";

/**
 * Managed home for project-less "session" workspace folders. Sibling of
 * `~/.superset/worktrees` — each entry is a standalone git repo owned by
 * exactly one session workspace, created and removed by the host.
 */
export function defaultSessionsRoot(): string {
	return join(homedir(), ".superset", "sessions");
}

/** Resolve `<sessionsRoot>/<folderName>` with a path-traversal guard. */
export function safeResolveSessionPath(folderName: string): string {
	const root = defaultSessionsRoot();
	const sessionPath = resolve(root, folderName);
	if (sessionPath === root || !sessionPath.startsWith(root + sep)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid session name: path traversal detected (${folderName})`,
		});
	}
	return sessionPath;
}

/**
 * True when `path` resolves strictly inside the sessions root. The destroy
 * saga's `rm -rf` refuses anything else, so a corrupt `worktreePath` on a
 * session row can never delete user data outside the managed folder.
 */
export function isInsideSessionsRoot(path: string): boolean {
	const root = normalizePath(defaultSessionsRoot());
	const resolved = normalizePath(path);
	return resolved !== root && resolved.startsWith(root + sep);
}

function normalizePath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return resolve(p);
	}
}
