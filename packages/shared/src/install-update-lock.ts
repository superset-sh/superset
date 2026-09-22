import {
	closeSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";

/** One install can serve several organizations; all writers must share this lock. */
export function acquireInstallUpdateLock(
	installRoot: string,
	options: { allowParent?: boolean } = {},
): () => void {
	const path = `${installRoot}.update-lock`;
	let fd: number;
	try {
		fd = openSync(path, "wx", 0o600);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
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
