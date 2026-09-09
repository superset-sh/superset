import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { ApiHttpError } from "../../../lib/api-client";
import submitCommand, {
	MAX_ATTACHMENT_TOTAL_BASE64_CHARS,
	MAX_ATTACHMENT_TOTAL_BYTES,
	planAttachmentUploads,
	readTailBytes,
} from "./command";

interface SubmittedAttachment {
	filename: string;
	contentBase64: string;
}

let submitted: { attachments?: SubmittedAttachment[] } | undefined;
let reject: (() => Error) | undefined;
let dir: string;
let stderr: string[];
let stderrSpy: ReturnType<typeof spyOn>;

function invoke(attach: string[]) {
	return submitCommand.run({
		ctx: {
			api: {
				support: {
					submitFeedback: {
						mutate: async (input: typeof submitted) => {
							if (reject) throw reject();
							submitted = input;
						},
					},
				},
			},
		} as never,
		args: {} as never,
		options: {
			type: "bug",
			title: "Attachment limits",
			body: "The log is attached.",
			attach: attach.join(","),
		} as never,
		signal: new AbortController().signal,
	});
}

/** Bytes whose value depends on their offset, so a tail is distinguishable from a head. */
function patterned(size: number): Buffer {
	const buffer = Buffer.alloc(size);
	for (let i = 0; i < size; i++) buffer[i] = i % 251;
	return buffer;
}

function writeFixture(name: string, content: Buffer): string {
	const path = join(dir, name);
	writeFileSync(path, content);
	return path;
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "superset-feedback-"));
	submitted = undefined;
	reject = undefined;
	stderr = [];
	stderrSpy = spyOn(process.stderr, "write").mockImplementation(((
		chunk: string | Uint8Array,
	) => {
		stderr.push(String(chunk));
		return true;
	}) as typeof process.stderr.write);
});

afterEach(() => {
	stderrSpy.mockRestore();
	rmSync(dir, { recursive: true, force: true });
});

describe("feedback submit attachments", () => {
	test("the enforced limit fits Vercel's 4.5 MB body cap after base64 expansion", () => {
		const encoded = Buffer.alloc(MAX_ATTACHMENT_TOTAL_BYTES).toString("base64");
		expect(encoded.length).toBeLessThanOrEqual(
			MAX_ATTACHMENT_TOTAL_BASE64_CHARS,
		);
		// Room for the report body (20k chars), the diagnostics bundle (under
		// 90k chars encoded), titles, filenames, and JSON framing.
		expect(MAX_ATTACHMENT_TOTAL_BASE64_CHARS + 110_000).toBeLessThan(4_500_000);
	});

	test("sends an attachment under the limit intact", async () => {
		const content = patterned(1024);
		const path = writeFixture("small.log", content);

		await invoke([path]);

		expect(submitted?.attachments).toHaveLength(1);
		expect(submitted?.attachments?.[0]?.filename).toBe("small.log");
		expect(
			Buffer.from(
				submitted?.attachments?.[0]?.contentBase64 ?? "",
				"base64",
			).equals(content),
		).toBe(true);
		expect(stderr.join("")).toBe("");
	});

	test("attaches the tail of a single oversized file and says so", async () => {
		const content = patterned(MAX_ATTACHMENT_TOTAL_BYTES + 4096);
		const path = writeFixture("host-service.log", content);

		await invoke([path]);

		expect(submitted?.attachments).toHaveLength(1);
		const attachment = submitted?.attachments?.[0];
		expect(attachment?.filename).toBe("host-service.log");
		expect(attachment?.contentBase64.length).toBeLessThanOrEqual(
			MAX_ATTACHMENT_TOTAL_BASE64_CHARS,
		);
		expect(
			Buffer.from(attachment?.contentBase64 ?? "", "base64").equals(
				content.subarray(content.length - MAX_ATTACHMENT_TOTAL_BYTES),
			),
		).toBe(true);
		expect(stderr.join("")).toContain(
			`Truncated host-service.log to its last ${MAX_ATTACHMENT_TOTAL_BYTES} bytes`,
		);
	});

	test("fails before uploading when several attachments together exceed the limit", async () => {
		const each = Math.ceil(MAX_ATTACHMENT_TOTAL_BYTES * 0.6);
		const first = writeFixture("host-service.log", patterned(each));
		const second = writeFixture("main.log", patterned(each));

		const error = await invoke([first, second]).catch((thrown) => thrown);
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toContain("3.2 MB");
		expect(error.message).toContain("host-service.log");
		expect(error.message).toContain("main.log");
		expect(submitted).toBeUndefined();
	});

	test("rejects an overflowing list before reading any of its files", async () => {
		const each = Math.ceil(MAX_ATTACHMENT_TOTAL_BYTES * 0.6);
		const first = writeFixture("host-service.log", patterned(each));
		const second = writeFixture("main.log", patterned(each));
		// Unreadable after sizing: a read before the rejection fails with
		// EACCES instead of the limit message.
		chmodSync(first, 0o000);
		chmodSync(second, 0o000);

		const error = await invoke([first, second]).catch((thrown) => thrown);
		expect(error.message).toContain("total limit");
		expect(error.message).not.toContain("EACCES");
		expect(submitted).toBeUndefined();
	});

	test("readTailBytes clamps to a file that shrank since it was planned", () => {
		const path = writeFixture("rotated.log", patterned(1_000));
		// Planned at a larger size, read after rotation left 1,000 bytes.
		const tail = readTailBytes(path, 50_000);
		expect(tail.length).toBe(1_000);
		expect(Buffer.compare(tail, patterned(1_000))).toBe(0);
		expect(readTailBytes(path, 0).length).toBe(0);
	});

	test("planAttachmentUploads works from sizes alone", () => {
		const lone = planAttachmentUploads([
			{
				path: "/x/a.log",
				filename: "a.log",
				size: MAX_ATTACHMENT_TOTAL_BYTES * 3,
			},
		]);
		expect(lone.files[0]?.bytes).toBe(MAX_ATTACHMENT_TOTAL_BYTES);
		expect(lone.notices).toHaveLength(1);
		expect(() =>
			planAttachmentUploads([
				{
					path: "/x/a.log",
					filename: "a.log",
					size: MAX_ATTACHMENT_TOTAL_BYTES,
				},
				{ path: "/x/b.log", filename: "b.log", size: 10 },
			]),
		).toThrow(/total limit.*a\.log, b\.log/);
	});

	test("surfaces a 413 from the platform with its status, text, and the limit hint", async () => {
		const path = writeFixture("small.log", patterned(1024));
		// What httpBatchLink throws when the response body is not JSON: the
		// fetch wrapper's error rides along as the cause.
		reject = () =>
			TRPCClientError.from(
				new ApiHttpError(
					413,
					"Request Entity Too Large",
					"Request Entity Too Large / FUNCTION_PAYLOAD_TOO_LARGE / sfo1::abc-123",
				),
			);

		const error = await invoke([path]).catch((thrown) => thrown);

		expect(error.name).toBe("CLIError");
		expect(error.message).toContain("HTTP 413");
		expect(error.message).toContain("FUNCTION_PAYLOAD_TOO_LARGE");
		expect(error.message).toContain("sfo1::abc-123");
		expect(error.suggestion).toContain("3.2 MB");
	});

	test("surfaces a tRPC error with its status and the server's message", async () => {
		const path = writeFixture("small.log", patterned(1024));
		reject = () =>
			TRPCClientError.from({
				error: {
					message: "Attachments exceed the 10MB total limit",
					code: -32600,
					data: { code: "BAD_REQUEST", httpStatus: 400 },
				},
			} as never);

		const error = await invoke([path]).catch((thrown) => thrown);

		expect(error.name).toBe("CLIError");
		expect(error.message).toContain("HTTP 400");
		expect(error.message).toContain("Attachments exceed the 10MB total limit");
		expect(error.suggestion).toBeUndefined();
	});

	test("leaves an expired session to the runner's own wording", async () => {
		const path = writeFixture("small.log", patterned(1024));
		const unauthorized = TRPCClientError.from({
			error: {
				message: "Not authenticated. Please sign in.",
				code: -32001,
				data: { code: "UNAUTHORIZED", httpStatus: 401 },
			},
		} as never);
		reject = () => unauthorized;

		const error = await invoke([path]).catch((thrown) => thrown);

		expect(error).toBe(unauthorized);
	});
});
