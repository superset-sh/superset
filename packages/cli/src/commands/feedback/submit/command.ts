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

const MAX_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024;
/** Mirrors the server's refine on submitFeedback input. */
const MAX_ATTACHMENT_TOTAL_BASE64_CHARS = 14_000_000;
const DIAGNOSTICS_LOG_TAIL_BYTES = 64 * 1024;
const DIAGNOSTICS_LOG_TAIL_LINES = 200;

interface FeedbackAttachment {
	filename: string;
	contentBase64: string;
}

function readTail(filePath: string): string {
	const size = statSync(filePath).size;
	const length = Math.min(size, DIAGNOSTICS_LOG_TAIL_BYTES);
	const buffer = Buffer.alloc(length);
	const fd = openSync(filePath, "r");
	try {
		readSync(fd, buffer, 0, length, size - length);
	} finally {
		closeSync(fd);
	}
	return buffer
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
			"Comma-separated file paths to attach (screenshots, logs; 10MB total)",
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
		let totalBase64Chars = 0;
		const addAttachment = (attachment: FeedbackAttachment) => {
			// Base64 is what travels, and the server limit is on encoded size.
			totalBase64Chars += attachment.contentBase64.length;
			if (totalBase64Chars > MAX_ATTACHMENT_TOTAL_BASE64_CHARS) {
				throw new CLIError("Attachments exceed the 10MB total limit");
			}
			attachments.push(attachment);
		};
		for (const rawPath of options.attach?.split(",") ?? []) {
			const path = rawPath.trim();
			if (!path) continue;
			if (!existsSync(path)) {
				throw new CLIError(`Attachment not found: ${path}`);
			}
			// Reject oversized files before reading them into memory.
			if (statSync(path).size > MAX_ATTACHMENT_TOTAL_BYTES) {
				throw new CLIError("Attachments exceed the 10MB total limit");
			}
			addAttachment({
				filename: basename(path),
				contentBase64: readFileSync(path).toString("base64"),
			});
		}
		if (options.diagnostics) {
			const bundle = collectDiagnostics();
			if (bundle) addAttachment(bundle);
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
