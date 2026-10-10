import { lstat } from "node:fs/promises";

export async function isMissingPath(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return false;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		return code === "ENOENT" || code === "ENOTDIR";
	}
}
