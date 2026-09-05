import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { attachErrorDiagnostics } from "../../../error-diagnostics";

// Node's own text for a `spawn` that never produced a process. `errnoException`
// builds it, so the syscall name and the errno are the whole line: `spawn
// EBADF` when child_process throws synchronously, `spawn git EAGAIN` when it
// defers to the child's error event (EACCES/EAGAIN/EMFILE/ENFILE/ENOENT take
// that route). simple-git surfaces the first as `String(err)` and the second as
// `err.stack` — one line, or that line followed by ` at ` frames.
//
// This is matched on text rather than on `err.code` because the errno is gone
// as structure long before this seam: simple-git's onFatalException replaces
// the SystemError with `new GitError(task, String(e))`, keeping only the
// sentence, and the worker boundary then keeps only name/message/stack/code.
// The syscall name and errno in that sentence are what survive.
const SPAWN_SYSCALL_FAILURE_PATTERN = /^(?:Error: )?spawn (?:.+ )?E[A-Z0-9]+$/;

/**
 * Whether a git failure is the spawn syscall failing rather than git running
 * and exiting non-zero.
 *
 * Anchored to the start of the message, which is what separates our own spawn
 * from one mentioned inside git's output: when the spawn fails there is no
 * process and so no git stderr, and the error text is the whole message. A
 * hook or filter that is itself a Node program can print the same sentence,
 * but it arrives mid-stream, behind the program's own output and ahead of the
 * `fatal:` line git adds.
 */
export function isSpawnSyscallFailure(message: string): boolean {
	const firstLine = message.split("\n", 1)[0] ?? "";
	return SPAWN_SYSCALL_FAILURE_PATTERN.test(firstLine);
}

/**
 * How many descriptors this process holds. `/proc/self/fd` on Linux, `/dev/fd`
 * on macOS; both list the caller's own table, and worker threads share it with
 * the main thread, so this is the table the failed spawn drew from. Counts the
 * descriptor the listing itself holds.
 */
function countOpenFileDescriptors(): number | undefined {
	const dir = process.platform === "linux" ? "/proc/self/fd" : "/dev/fd";
	try {
		return readdirSync(dir).length;
	} catch {
		return undefined;
	}
}

// RLIMIT_NOFILE is inherited at exec and nothing in this process changes it,
// so it is read once: process.report.getReport() is the only core API that
// exposes it and it costs ~12ms, which this path would otherwise pay on every
// poll — the failure repeats every couple of seconds for hours.
let softLimit: number | string | undefined;
let softLimitRead = false;

function fileDescriptorSoftLimit(): number | string | undefined {
	if (softLimitRead) return softLimit;
	softLimitRead = true;
	try {
		const report = process.report?.getReport() as
			| { userLimits?: { open_files?: { soft?: unknown } } }
			| undefined;
		const soft = report?.userLimits?.open_files?.soft;
		// `soft` is a number, or "unlimited" where the platform reports no cap.
		if (typeof soft === "number" || typeof soft === "string") softLimit = soft;
	} catch {
		// Diagnostics must never replace the failure they describe.
	}
	return softLimit;
}

// On macOS RLIMIT_NOFILE is not the ceiling: the kernel also caps a process at
// kern.maxfilesperproc, and opening stops there. Measured on 26.6, a process
// reporting a 1,048,576 soft limit took EMFILE after 245,748 descriptors,
// against a kern.maxfilesperproc of 245,760 — so the number above overstates
// the real ceiling more than fourfold, and every one of these failures so far
// has come from macOS. The daemon supervisor raises the soft limit to
// 1,048,576 before exec, which widens the gap further.
//
// Read once in the background at import rather than on the failure path: this
// costs a spawn, and the thing being diagnosed is a spawn that would not
// start.
let enforcedLimit: number | undefined;

if (process.platform === "darwin") {
	try {
		execFile("/usr/sbin/sysctl", ["-n", "kern.maxfilesperproc"], (err, out) => {
			if (err) return;
			const parsed = Number.parseInt(out.trim(), 10);
			if (Number.isFinite(parsed)) enforcedLimit = parsed;
		});
	} catch {
		// Diagnostics must never replace the failure they describe.
	}
}

/**
 * Record the descriptor table on a git failure that never got as far as
 * running git.
 *
 * These failures report with no first-party frame — the captured stack is
 * entirely simple-git's executor — and nothing in the event says why the
 * spawn was refused. The count against the enforced ceiling separates the two
 * candidates: at the ceiling is exhaustion, and the leak is ours to find;
 * nowhere near it is a descriptor that went bad while we still held it.
 *
 * Read the errno before the count, because it already settles which question
 * to ask: running out of descriptors is EMFILE, so an EBADF is a descriptor
 * that went bad and no count will explain it. See HOST-SERVICE-4E and
 * HOST-SERVICE-1R, where a machine enters this state and every subsequent
 * poll fails the same way for hours.
 *
 * No-op for anything else, and no-op on the error itself: the message,
 * classification and 500 are exactly what they were.
 */
export function attachSpawnFailureDiagnostics(error: unknown): void {
	if (!(error instanceof Error)) return;
	if (!isSpawnSyscallFailure(error.message)) return;
	attachErrorDiagnostics(error, {
		open_file_descriptors: countOpenFileDescriptors(),
		file_descriptor_soft_limit: fileDescriptorSoftLimit(),
		file_descriptor_enforced_limit: enforcedLimit,
	});
}
