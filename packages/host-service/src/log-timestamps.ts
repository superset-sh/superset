/**
 * Prefixes every console line with a UTC timestamp.
 *
 * host-service.log is the child's raw stdout/stderr, written through by
 * whoever spawned it (desktop coordinator, CLI). Nothing on that path adds
 * time, so a log full of git timeouts and watcher batches cannot be lined up
 * with the freeze the user saw or with the desktop's own main.log. Installed
 * once at process start, before the first line is written.
 *
 * A leading string argument is extended rather than displaced so
 * `console.log("%s ...", x)` keeps its format semantics; any other first
 * argument gets the stamp as its own leading argument.
 */

const METHODS = ["log", "info", "warn", "error", "debug"] as const;

export function stampArgs(now: Date, args: unknown[]): unknown[] {
	const stamp = now.toISOString();
	if (typeof args[0] === "string") {
		return [`${stamp} ${args[0]}`, ...args.slice(1)];
	}
	return [stamp, ...args];
}

export function installConsoleTimestamps(
	target: Pick<Console, (typeof METHODS)[number]> = console,
	now: () => Date = () => new Date(),
): void {
	for (const method of METHODS) {
		const original = target[method].bind(target);
		target[method] = (...args: unknown[]) => {
			original(...stampArgs(now(), args));
		};
	}
}
