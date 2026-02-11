import treeKill from "tree-kill";

const DEFAULT_ESCALATION_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 50;

/**
 * Kill a process tree with escalation to SIGKILL if the process survives.
 * Sends SIGTERM, polls for exit, escalates to SIGKILL after timeout.
 */
export function treeKillWithEscalation({
	pid,
	signal = "SIGTERM",
	escalationTimeoutMs = DEFAULT_ESCALATION_TIMEOUT_MS,
}: {
	pid: number;
	signal?: string;
	escalationTimeoutMs?: number;
}): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		let resolved = false;
		let pollTimer: ReturnType<typeof setInterval> | null = null;
		let escalationTimer: ReturnType<typeof setTimeout> | null = null;

		const clearTimers = () => {
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
			if (escalationTimer) {
				clearTimeout(escalationTimer);
				escalationTimer = null;
			}
		};

		const doResolve = (result: { success: boolean; error?: string }) => {
			if (resolved) return;
			resolved = true;
			clearTimers();
			resolve(result);
		};

		treeKill(pid, signal, (err) => {
			if (resolved) return;

			if (err) {
				if (isProcessNotFoundError(err)) {
					doResolve({ success: true });
					return;
				}
				console.error(
					`[treeKillWithEscalation] Failed to ${signal} pid ${pid}:`,
					err,
				);
			}

			if (!isProcessAlive(pid)) {
				doResolve({ success: true });
				return;
			}

			pollTimer = setInterval(() => {
				if (!isProcessAlive(pid)) {
					doResolve({ success: true });
				}
			}, POLL_INTERVAL_MS);
			pollTimer.unref();
		});

		escalationTimer = setTimeout(() => {
			escalationTimer = null;
			if (resolved) return;

			if (!isProcessAlive(pid)) {
				doResolve({ success: true });
				return;
			}

			console.log(
				`[treeKillWithEscalation] Process ${pid} still alive after ${signal}, escalating to SIGKILL`,
			);

			treeKill(pid, "SIGKILL", (err) => {
				if (resolved) return;

				if (err) {
					if (isProcessNotFoundError(err)) {
						doResolve({ success: true });
						return;
					}
					console.error(
						`[treeKillWithEscalation] Failed to SIGKILL pid ${pid}:`,
						err,
					);
					doResolve({ success: false, error: err.message });
				} else {
					doResolve({ success: true });
				}
			});
		}, escalationTimeoutMs);
		escalationTimer.unref();
	});
}

/**
 * ESRCH = dead, EPERM = alive (process exists but we lack permission)
 */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

function isProcessNotFoundError(err: Error): boolean {
	const code = (err as NodeJS.ErrnoException).code;
	if (code === "ESRCH") return true;
	const message = err.message ?? "";
	return message.includes("ESRCH") || message.includes("No such process");
}
