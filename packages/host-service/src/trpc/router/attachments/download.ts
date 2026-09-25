import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { TRPCError } from "@trpc/server";

/** One resolved attachment, as `attachment.resolve` on the API returns it. */
export interface CloudAttachment {
	fileId: string;
	name: string;
	contentType: string;
	sizeBytes: number;
	url: string;
}

/**
 * The body as an async iterable of chunks.
 *
 * `Readable.fromWeb` would be the obvious call, but this file is typechecked
 * under DOM lib types as well (the desktop compiles host-service source), and
 * the two `ReadableStream` declarations are not assignable to each other.
 * `getReader` exists identically in both.
 */
async function* chunksOf(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
	const reader = body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return;
			if (value) yield value;
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Streams a presigned GET straight to disk.
 *
 * Streamed rather than buffered because these are the uploads too large to
 * have come through the relay in the first place — holding one in memory
 * here would just move the ceiling from the Worker to the host.
 *
 * A partial write is removed: an attachment that stops halfway would
 * otherwise reach the agent as a truncated file that looks whole.
 */
export async function downloadAttachment(
	attachment: CloudAttachment,
	destination: string,
): Promise<void> {
	const response = await fetch(attachment.url);
	if (!response.ok || !response.body) {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: `Could not download ${attachment.name} (${response.status})`,
		});
	}

	try {
		await pipeline(
			chunksOf(response.body),
			createWriteStream(destination, { mode: 0o600 }),
		);
	} catch (cause) {
		await rm(destination, { force: true });
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: `Could not download ${attachment.name}`,
			cause,
		});
	}
}
