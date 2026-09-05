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

/** The last `length` bytes of a file, without reading the rest into memory. */
function readTailBytes(filePath: string, length: number): Buffer {
	const size = statSync(filePath).size;
	const buffer = Buffer.alloc(length);
	const fd = openSync(filePath, "r");
	try {
		readSync(fd, buffer, 0, length, size - length);
	} finally {
		closeSync(fd);
	}
	return buffer;
}

function readTail(filePath: string): string {
	const size = statSync(filePath).size;
	return readTailBytes(filePath, Math.min(size, DIAGNOSTICS_LOG_TAIL_BYTES))
		.toString("utf-8")
		.split("\n")
		.slice(-DIAGNOSTICS_LOG_TAIL_LINES)
		.join("\n");
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

		const attachments: FeedbackAttachment[] = [];
		const truncated: string[] = [];
		let totalBase64Chars = 0;
		for (const rawPath of options.attach?.split(",") ?? []) {
			const path = rawPath.trim();
			if (!path) continue;
			if (!existsSync(path)) {
				throw new CLIError(`Attachment not found: ${path}`);
			}
			// A lone oversized file is usually a log, and its tail is what
			// matters, so keep the newest bytes instead of failing.
			const size = statSync(path).size;
			const bytes = Math.min(size, MAX_ATTACHMENT_TOTAL_BYTES);
			if (bytes < size) {
				truncated.push(
					`Truncated ${basename(path)} to its last ${bytes} bytes (${ATTACHMENT_LIMIT_LABEL} attachment limit)\n`,
				);
			}
			const contentBase64 = readTailBytes(path, bytes).toString("base64");
			// Base64 is what travels, and the body limit is on encoded size.
			totalBase64Chars += contentBase64.length;
			attachments.push({ filename: basename(path), contentBase64 });
		}
		if (totalBase64Chars > MAX_ATTACHMENT_TOTAL_BASE64_CHARS) {
			throw new CLIError(
				`Attachments exceed the ${ATTACHMENT_LIMIT_LABEL} total limit: ${attachments.map((a) => a.filename).join(", ")}`,
				"Attach fewer files, or one file at a time so its tail is kept",
			);
		}
		for (const line of truncated) process.stderr.write(line);
		if (options.diagnostics) {
			const bundle = collectDiagnostics();
			if (bundle) attachments.push(bundle);
		}
		if (attachments.length > 5) {
			throw new CLIError("At most 5 attachments per submission");
		}

		await ctx.api.support.submitFeedback.mutate({
			type: options.type,
			title: options.title,
			body,
			appVersion: process.env.SUPERSET_VERSION ?? "dev",
			os: `${os.platform()} ${os.release()} ${os.arch()}`,
			attachments: attachments.length > 0 ? attachments : undefined,
		});

		return {
			data: { submitted: true, attachments: attachments.length },
			message:
				"Feedback sent to the Superset team. A copy was CC'd to your account email; replies land there too.",
		};
	},
});
