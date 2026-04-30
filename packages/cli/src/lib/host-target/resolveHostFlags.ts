import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";

export interface HostFlags {
	host: string | undefined;
	local: boolean | undefined;
}

/**
 * Convert `--host` / `--local` flags into a target hostId.
 *
 * - Both unset → undefined (caller decides what unscoped means).
 * - `--local` → this machine's hostId.
 * - `--host <id>` → that hostId.
 * - Both set → error (mutually exclusive).
 */
export function resolveHostFilter(flags: HostFlags): string | undefined {
	if (flags.host && flags.local) {
		throw new CLIError(
			"Pass either --host or --local, not both",
			"Use --local for this machine, --host <id> for a specific host.",
		);
	}
	if (flags.local) return getHostId();
	return flags.host ?? undefined;
}

/**
 * Like `resolveHostFilter`, but for commands where a target host is required.
 * Errors if neither flag is set.
 */
export function requireHostTarget(flags: HostFlags): string {
	const resolved = resolveHostFilter(flags);
	if (!resolved) {
		throw new CLIError(
			"Target host required",
			"Pass --local for this machine, or --host <id> for a specific host.",
		);
	}
	return resolved;
}
