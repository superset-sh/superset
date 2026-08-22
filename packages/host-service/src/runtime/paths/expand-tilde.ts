import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { TRPCError } from "@trpc/server";

/**
 * Expands a leading `~` against the host's home directory and normalizes.
 * Rejects relative paths: user-supplied paths execute on the host-service,
 * whose working directory has no meaning to the user — resolving against it
 * silently drops files somewhere unexpected (a typed `~/dev` used to become
 * a literal `~` folder under the daemon's cwd).
 */
export function expandTildeAbsolute(input: string): string {
	const trimmed = input.trim();
	if (trimmed.startsWith("~")) {
		const rest = trimmed.slice(1);
		if (rest === "" || rest.startsWith("/") || rest.startsWith("\\")) {
			return normalize(join(homedir(), rest));
		}
	}
	if (!isAbsolute(trimmed)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path must be absolute or start with ~",
		});
	}
	return normalize(trimmed);
}
