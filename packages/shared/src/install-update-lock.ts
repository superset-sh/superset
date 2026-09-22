import {
	accessSync,
	closeSync,
	constants,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/** One install can serve several organizations; all writers must share this lock. */
export function acquireInstallUpdateLock(
	installRoot: string,
	options: { allowParent?: boolean } = {},
): () => void {
	const path = `${installRoot}.update-lock`;
	let fd: number;
	try {
		accessSync(dirname(installRoot), constants.W_OK | constants.X_OK);
		fd = openSync(path, "wx", 0o600);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
			throw new Error(
				`Cannot update install at ${installRoot}: permission denied accessing ${path} (${code}). The host user (uid ${process.getuid?.() ?? "unknown"}) needs write and search access to ${dirname(installRoot)} for the update lock, staging directory, and install swap. Ask the administrator to fix ownership/permissions of this dedicated install directory and any existing lock, or reinstall as the host user under ~/superset. Do not remove a lock while an update is running.`,
				{ cause: error },
			);
		}
		if (code !== "EEXIST") throw error;
		let owner: number | null = null;
		try {
			owner = Number(readFileSync(path, "utf8"));
		} catch {}
		// The host owns the whole restart transaction; its CLI child only
		// downloads and swaps. A separate CLI invocation must not touch its backup.
		if (options.allowParent && owner === process.ppid) return () => {};
		throw new Error(
			`Install update locked at ${path} (pid ${owner ?? "unknown"}). If that process has exited, remove the lock and retry.`,
		);
	}
	try {
		writeFileSync(fd, String(process.pid));
	} finally {
		closeSync(fd);
	}
	return () => {
		try {
			if (readFileSync(path, "utf8") === String(process.pid)) unlinkSync(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	};
}
