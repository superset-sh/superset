import { constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";

/** Read bounded metadata from one regular file, without waiting on a FIFO. */
export async function readProfileFile(
	path: string,
	maxBytes: number,
): Promise<{ content: string; mtimeMs: number } | null> {
	let file: FileHandle | undefined;
	try {
		file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
		const info = await file.stat();
		if (!info.isFile() || info.size > maxBytes) return null;
		// The extra byte detects a file growing between stat and read. Keep the
		// original descriptor so a path replacement cannot introduce a pipe.
		const buffer = Buffer.alloc(info.size + 1);
		let total = 0;
		while (total < buffer.length) {
			const { bytesRead } = await file.read(
				buffer,
				total,
				buffer.length - total,
				total,
			);
			if (bytesRead === 0) break;
			total += bytesRead;
		}
		if (total > info.size) return null;
		return {
			content: buffer.toString("utf8", 0, total),
			mtimeMs: info.mtimeMs,
		};
	} catch {
		return null;
	} finally {
		await file?.close();
	}
}
