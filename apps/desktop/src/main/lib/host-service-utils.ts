import { createServer } from "node:net";
import path from "node:path";

export {
	MAX_HOST_LOG_BYTES,
	openRotatingLogFd,
} from "@superset/shared/rotating-log";

// Before the server becomes reachable, startup must still clear DB migrate and
// the daemon bootstrap (the shell-env snapshot now runs in the background, off
// the critical path). At boot every known org starts at once, and multiple app
// instances sharing one $SUPERSET_HOME_DIR compound the contention, so a
// healthy-but-slow child can need well over 10s. Give it generous headroom; a
// genuinely dead child is detected early via the poll's abort hook rather than
// by this deadline.
export const HEALTH_POLL_TIMEOUT_MS = 30_000;

const HEALTH_POLL_INTERVAL_MS = 200;

export async function findFreePort(
	preferredPorts: Iterable<number> = [],
): Promise<number> {
	const triedPorts = new Set<number>();
	for (const port of preferredPorts) {
		const normalizedPort = normalizePort(port);
		if (!normalizedPort || triedPorts.has(normalizedPort)) continue;
		triedPorts.add(normalizedPort);
		if (await canBindPort(normalizedPort)) return normalizedPort;
	}

	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (addr && typeof addr === "object") {
				const { port } = addr;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error("Could not get port")));
			}
		});
		server.on("error", reject);
	});
}

function normalizePort(port: number): number | null {
	if (!Number.isInteger(port) || port <= 0 || port > 65_535) return null;
	return port;
}

export function canBindPort(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		const finish = (available: boolean) => {
			server.removeAllListeners("error");
			server.removeAllListeners("listening");
			if (!available) {
				resolve(false);
				return;
			}
			server.close(() => resolve(true));
		};

		server.once("error", () => finish(false));
		server.once("listening", () => finish(true));
		server.listen(port, "127.0.0.1");
	});
}

export async function pollHealthCheck(
	endpoint: string,
	secret: string,
	timeoutMs = HEALTH_POLL_TIMEOUT_MS,
	// Bail out before the deadline once the child is known dead — otherwise a
	// crash-on-startup would stall the caller for the full (now generous)
	// timeout instead of failing fast.
	shouldAbort?: () => boolean,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (shouldAbort?.()) return false;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2_000);
		try {
			const res = await fetch(`${endpoint}/trpc/health.check`, {
				signal: controller.signal,
				headers: { Authorization: `Bearer ${secret}` },
			});
			if (res.ok) return true;
		} catch {
			// Not ready yet
		} finally {
			clearTimeout(timeout);
		}
		await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
	}
	return false;
}

/**
 * Lookahead asserting the home directory ended a path segment: end of input, or
 * a separator. Both separators are accepted — `os.homedir()` is `C:\Users\...`
 * on Windows and paths under it get logged with either — and widening the
 * lookahead can only ever refuse more matches, never admit one.
 */
const PATH_SEGMENT_END = "(?=$|[/\\\\])";

/** So a HOME containing regex metacharacters cannot change what matches. */
function escapeRegExp(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip secrets and the user's home directory out of a child's output tail
 * before it is attached to a crash report.
 *
 * The home directory is replaced rather than dropped: a macOS account name is
 * usually a person's real name, and a host-service tail is mostly worktree
 * paths beneath it, so one crash report can carry the name hundreds of times.
 * `~` keeps the path readable — which worktree the child died under is part of
 * the diagnosis.
 *
 * Both substitutions are exact strings we already know, never patterns. The
 * tail is the only evidence a hard kill (SIGSEGV, OOM) leaves behind, so a
 * matcher that reached past what it named would redact the diagnosis along
 * with the name.
 *
 * The home directory matches only at a path-segment boundary. `/Users/ada` is a
 * literal substring of `/Users/adam/project` — a *different* account's path,
 * outside this home — and rewriting that to `~m/project` would corrupt exactly
 * what this is here to protect. `/Users/ada-old` left by a migration and a
 * second account on the machine both produce it.
 */
export function redactCrashTail(
	tail: string,
	options: { secrets?: readonly string[]; homeDir?: string } = {},
): string {
	let redacted = tail;
	for (const secret of options.secrets ?? []) {
		// `"".split("")` splits between every character: an empty secret would
		// leave nothing but separators.
		if (!secret) continue;
		redacted = redacted.split(secret).join("[redacted]");
	}
	const { homeDir } = options;
	// A root is its own parent. It also prefixes nearly every absolute path in
	// the tail, so substituting one would erase the report.
	if (homeDir && path.dirname(homeDir) !== homeDir) {
		redacted = redacted.replace(
			new RegExp(`${escapeRegExp(homeDir)}${PATH_SEGMENT_END}`, "g"),
			"~",
		);
	}
	return redacted;
}
