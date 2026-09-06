import {
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	readSync,
	statSync,
} from "node:fs";
import os from "node:os";
import { basename, join } from "node:path";
import { boolean, CLIError, string } from "@superset/cli-framework";
import { ApiHttpError } from "../../../lib/api-client";
import { command } from "../../../lib/command";

/**
 * The tRPC route is a Vercel function, and Vercel rejects request bodies
 * above 4.5 MB with 413 FUNCTION_PAYLOAD_TOO_LARGE before the route's own
 * 14M-char refine ever runs, so that refine is not the real limit. The
 * headroom covers the rest of the body: the report (up to 20k chars), the
 * title, JSON framing, and the diagnostics bundle (under 90k chars encoded).
 */
const VERCEL_MAX_REQUEST_BODY_BYTES = 4_500_000;
const REQUEST_BODY_HEADROOM_BYTES = 200_000;
export const MAX_ATTACHMENT_TOTAL_BASE64_CHARS =
	VERCEL_MAX_REQUEST_BODY_BYTES - REQUEST_BODY_HEADROOM_BYTES;
/** Raw bytes whose base64 form (4 chars per 3 bytes) fits the encoded budget. */
export const MAX_ATTACHMENT_TOTAL_BYTES =
	Math.floor(MAX_ATTACHMENT_TOTAL_BASE64_CHARS / 4) * 3;
const ATTACHMENT_LIMIT_LABEL = `${(MAX_ATTACHMENT_TOTAL_BYTES / 1_000_000).toFixed(1)} MB`;
const DIAGNOSTICS_LOG_TAIL_BYTES = 64 * 1024;
const DIAGNOSTICS_LOG_TAIL_LINES = 200;

interface FeedbackAttachment {
	filename: string;
	contentBase64: string;
}

/**
 * The last `length` bytes of a file, without reading the rest into memory.
 * The file is sized again here: a live log can shrink or rotate between the
 * planning stat and this read, so the tail is clamped to what exists now and
 * a short read is honored rather than padded.
 */
export function readTailBytes(filePath: string, length: number): Buffer {
	const size = statSync(filePath).size;
	const wanted = Math.min(length, size);
	const buffer = Buffer.alloc(wanted);
	const fd = openSync(filePath, "r");
	try {
		const read = readSync(fd, buffer, 0, wanted, size - wanted);
		return buffer.subarray(0, read);
	} finally {
		closeSync(fd);
	}
}

function readTail(filePath: string): string {
	const size = statSync(filePath).size;
	return readTailBytes(filePath, Math.min(size, DIAGNOSTICS_LOG_TAIL_BYTES))
		.toString("utf-8")
		.split("\n")
		.slice(-DIAGNOSTICS_LOG_TAIL_LINES)
		.join("\n");
}

/**
 * A rejection with an HTTP status behind it, whether tRPC produced it or the
 * platform in front of the API did (Vercel's 413 arrives as the `cause` of a
 * "Failed to parse JSON" error). Anything else, such as an expired session or
 * an unreachable API, keeps the runner's own wording.
 */
function describeRejection(
	error: unknown,
): { status: number; message: string } | null {
	if (!(error instanceof Error)) return null;
	if (error.cause instanceof ApiHttpError) {
		const { status, statusText, body } = error.cause;
		return { status, message: body || statusText };
	}
	const trpc = error as Error & {
		data?: { code?: string; httpStatus?: number };
	};
	if (
		typeof trpc.data?.httpStatus === "number" &&
		trpc.data.code !== "UNAUTHORIZED"
	) {
		return { status: trpc.data.httpStatus, message: error.message };
	}
	return null;
}

function collectDiagnostics(): FeedbackAttachment | null {
	const lines = [
		`Collected: ${new Date().toISOString()}`,
		`CLI version: ${process.env.SUPERSET_VERSION ?? "dev"}`,
		`OS: ${os.platform()} ${os.release()} ${os.arch()}`,
	];
	const logPath = join(os.homedir(), "Library", "Logs", "Superset", "main.log");
	if (process.platform === "darwin" && existsSync(logPath)) {
		lines.push(
			"",
			`--- last ${DIAGNOSTICS_LOG_TAIL_LINES} lines of ${logPath} ---`,
			readTail(logPath),
		);
	} else {
		lines.push("", "(no app log found on this machine)");
	}
	return {
		filename: "feedback-diagnostics.txt",
		contentBase64: Buffer.from(lines.join("\n"), "utf-8").toString("base64"),
	};
}

export interface AttachmentUploadPlan {
	files: { path: string; filename: string; bytes: number }[];
	/** Lines to print before uploading, one per truncated file. */
	notices: string[];
}

/** Base64 spends 4 chars per 3 bytes, rounded up to the last group. */
function base64CharsFor(bytes: number): number {
	return Math.ceil(bytes / 3) * 4;
}

/**
 * Decides what to send from file sizes alone, before any file is read. A lone
 * file over the budget is cut to its tail (logs are the common case and the
 * newest bytes are what matter). Several files that together overflow are
 * rejected here, so nothing is read or encoded only to be thrown away.
 */
export function planAttachmentUploads(
	requested: { path: string; filename: string; size: number }[],
): AttachmentUploadPlan {
	const files = requested.map((file) => ({
		...file,
		bytes: Math.min(file.size, MAX_ATTACHMENT_TOTAL_BYTES),
	}));
	const totalChars = files.reduce(
		(sum, file) => sum + base64CharsFor(file.bytes),
		0,
	);
	if (totalChars > MAX_ATTACHMENT_TOTAL_BASE64_CHARS) {
		throw new CLIError(
			`Attachments exceed the ${ATTACHMENT_LIMIT_LABEL} total limit: ${files.map((file) => file.filename).join(", ")}`,
			"Attach fewer files, or one file at a time so its tail is kept",
		);
	}
	return {
		files: files.map(({ path, filename, bytes }) => ({
			path,
			filename,
			bytes,
		})),
		notices: files
			.filter((file) => file.bytes < file.size)
			.map(
				(file) =>
					`Truncated ${file.filename} to its last ${file.bytes} bytes (${ATTACHMENT_LIMIT_LABEL} attachment limit)\n`,
			),
	};
}

export default command({
	description:
		"Submit feedback privately to the Superset team (sent from your account so we can reply)",
	options: {
		type: string()
			.enum("bug", "feature", "general")
			.required()
			.desc("Kind of feedback"),
		title: string().required().desc("One-line summary"),
		body: string().desc("Full report"),
		bodyFile: string().desc(
			"Path to a file containing the report, - for stdin",
		),
		attach: string().desc(
			`Comma-separated file paths to attach (screenshots, logs; ${ATTACHMENT_LIMIT_LABEL} total, a lone larger file is cut to its tail)`,
		),
		diagnostics: boolean().desc(
			"Attach a diagnostics bundle (CLI version, OS, last 200 app log lines)",
		),
	},
	run: async ({ ctx, options }) => {
		const body = options.body
			? options.body
			: options.bodyFile
				? readFileSync(
						options.bodyFile === "-" ? 0 : options.bodyFile,
						"utf-8",
					).trim()
				: null;
		if (!body) {
			throw new CLIError("Provide the report via --body or --body-file");
		}

		// Everything is sized before anything is read: a list that cannot fit
		// is rejected without reading or encoding a byte of it.
		const requested = (options.attach?.split(",") ?? [])
			.map((rawPath) => rawPath.trim())
			.filter(Boolean)
			.map((path) => {
				if (!existsSync(path)) {
					throw new CLIError(`Attachment not found: ${path}`);
				}
				return { path, filename: basename(path), size: statSync(path).size };
			});
		const plan = planAttachmentUploads(requested);
		for (const line of plan.notices) process.stderr.write(line);
		const attachments: FeedbackAttachment[] = plan.files.map((file) => ({
			filename: file.filename,
			contentBase64: readTailBytes(file.path, file.bytes).toString("base64"),
		}));
		if (options.diagnostics) {
			const bundle = collectDiagnostics();
			if (bundle) attachments.push(bundle);
		}
		if (attachments.length > 5) {
			throw new CLIError("At most 5 attachments per submission");
		}

		try {
			await ctx.api.support.submitFeedback.mutate({
				type: options.type,
				title: options.title,
				body,
				appVersion: process.env.SUPERSET_VERSION ?? "dev",
				os: `${os.platform()} ${os.release()} ${os.arch()}`,
				attachments: attachments.length > 0 ? attachments : undefined,
			});
		} catch (error) {
			const rejection = describeRejection(error);
			if (!rejection) throw error;
			throw new CLIError(
				`The server rejected the feedback (HTTP ${rejection.status}): ${rejection.message}`,
				rejection.status === 413
					? `The request was over the API's 4.5 MB body cap. Attachments must total under ${ATTACHMENT_LIMIT_LABEL}; attach fewer or smaller files, or a single log so its tail is kept`
					: undefined,
			);
		}

		return {
			data: { submitted: true, attachments: attachments.length },
			message:
				"Feedback sent to the Superset team. A copy was CC'd to your account email; replies land there too.",
		};
	},
});
