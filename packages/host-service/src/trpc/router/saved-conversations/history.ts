import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
	lstat,
	mkdir,
	open,
	opendir,
	realpath,
	unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { claudeProjectDirName } from "../../../terminal-agents/harness-sessions/claude";
import type { AccountResumeHistory } from "../terminal-agents/account-resume-history";

export const NATIVE_UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DIRECTORY_ENTRIES = 10_000;
const PAGE_SIZE = 100;

export function checkpointDirectoryForDatabase(
	dbPath: string | undefined,
): string {
	return dbPath
		? join(dirname(resolve(dbPath)), "saved-conversation-checkpoints")
		: "";
}

export function revision(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function unavailable(
	message = "Saved conversation history is unavailable or changed. Refresh the list. Nothing was launched.",
): never {
	throw new TRPCError({ code: "PRECONDITION_FAILED", message });
}

async function projectDirectory(storePath: string, cwd: string) {
	const directory = join(storePath, claudeProjectDirName(cwd));
	try {
		if (
			!(await lstat(directory)).isDirectory() ||
			(await realpath(directory)) !== directory
		)
			unavailable();
		return directory;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function nativeMetadata(
	storePath: string,
	cwd: string,
	sessionId: string,
) {
	if (!NATIVE_UUID.test(sessionId)) unavailable();
	const directory = await projectDirectory(storePath, cwd);
	if (!directory) unavailable();
	const path = join(directory, `${sessionId}.jsonl`);
	let info: Awaited<ReturnType<typeof lstat>>;
	try {
		info = await lstat(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") unavailable();
		throw error;
	}
	if (!info.isFile()) unavailable();
	return {
		path,
		device: info.dev,
		inode: info.ino,
		size: info.size,
		modifiedAt: info.mtimeMs,
		changedAt: info.ctimeMs,
	};
}

/** Metadata only. A filename is not native identity proof. */
export async function discoverNativeMetadata(
	storePath: string,
	cwd: string,
	cursor?: string,
) {
	const directory = await projectDirectory(storePath, cwd);
	if (!directory) return { candidates: [], nextCursor: null };
	const ids: string[] = [];
	let visited = 0;
	for await (const entry of await opendir(directory)) {
		if (++visited > MAX_DIRECTORY_ENTRIES)
			unavailable(
				"This history directory exceeds the discovery limit. No partial list was returned.",
			);
		if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
		const id = entry.name.slice(0, -6);
		if (NATIVE_UUID.test(id) && (!cursor || id > cursor)) ids.push(id);
	}
	ids.sort();
	const page = ids.slice(0, PAGE_SIZE);
	const candidates = [];
	for (const nativeSessionId of page) {
		candidates.push({
			nativeSessionId,
			...(await nativeMetadata(storePath, cwd, nativeSessionId)),
		});
	}
	return {
		candidates,
		nextCursor: ids.length > PAGE_SIZE ? (page.at(-1) ?? null) : null,
	};
}

/** Preserve the exact validated bytes; never overwrite a checkpoint or source. */
export async function checkpointNativeHistory(
	history: AccountResumeHistory,
	directory: string,
	id: string,
): Promise<string> {
	if (!NATIVE_UUID.test(id) || !isAbsolute(directory))
		unavailable("The private history checkpoint directory is unavailable.");
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const parent = await lstat(directory);
	if (
		!parent.isDirectory() ||
		parent.isSymbolicLink() ||
		(parent.mode & 0o077) !== 0
	)
		unavailable("The private history checkpoint directory is unavailable.");
	const path = join(directory, `${id}.jsonl`);
	const source = await open(
		history.path,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	let created = false;
	try {
		const before = await source.stat();
		const matches = (info: typeof before) =>
			info.isFile() &&
			info.dev === history.device &&
			info.ino === history.inode &&
			info.size === history.size &&
			info.mtimeMs === history.modifiedAt &&
			info.ctimeMs === history.changedAt;
		if (!matches(before)) unavailable();
		const bytes = Buffer.alloc(history.size);
		let offset = 0;
		while (offset < bytes.length) {
			const result = await source.read(
				bytes,
				offset,
				Math.min(64 * 1024, bytes.length - offset),
				offset,
			);
			if (!result.bytesRead) unavailable();
			offset += result.bytesRead;
		}
		if (
			!matches(await source.stat()) ||
			createHash("sha256").update(bytes).digest("hex") !== history.sha256
		)
			unavailable();
		const output = await open(
			path,
			constants.O_WRONLY |
				constants.O_CREAT |
				constants.O_EXCL |
				constants.O_NOFOLLOW,
			0o600,
		);
		created = true;
		try {
			await output.writeFile(bytes);
			await output.sync();
		} finally {
			await output.close();
		}
		return path;
	} catch (error) {
		if (created) await unlink(path);
		throw error;
	} finally {
		await source.close();
	}
}
