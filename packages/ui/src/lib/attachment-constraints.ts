import { msg } from "@lingui/core/macro";
import { i18n } from "./i18n";

export type AttachmentConstraintError = {
	code: "max_files" | "max_file_size" | "accept";
	message: string;
};

export interface AttachmentConstraints {
	/** Comma-separated MIME patterns, e.g. "image/*,application/pdf". */
	accept?: string;
	maxFiles?: number;
	maxFileSize?: number;
}

/** True when the file matches one of the `accept` patterns (or there are none). */
export function matchesAccept(file: File, accept?: string): boolean {
	if (!accept || accept.trim() === "") return true;
	return accept
		.split(",")
		.map((pattern) => pattern.trim())
		.filter(Boolean)
		.some((pattern) =>
			pattern.endsWith("/*")
				? file.type.startsWith(pattern.slice(0, -1))
				: file.type === pattern,
		);
}

/**
 * Narrow an incoming batch to the files a composer will accept, reporting the
 * first blocking reason through `onError`.
 *
 * Kept out of the component because the constraints are declared on
 * PromptInput while the files may live either in its own state or in a
 * controller, and both paths have to enforce them identically.
 */
export function applyAttachmentConstraints(options: {
	files: File[] | FileList;
	/** How many attachments the composer already holds. */
	currentCount: number;
	constraints: AttachmentConstraints;
	onError?: (error: AttachmentConstraintError) => void;
}): File[] {
	const { currentCount, constraints, onError } = options;
	const incoming = Array.from(options.files);

	const accepted = incoming.filter((file) =>
		matchesAccept(file, constraints.accept),
	);
	if (incoming.length > 0 && accepted.length === 0) {
		onError?.({
			code: "accept",
			message: i18n._(
				msg({
					message: "No files match the accepted types.",
				}),
			),
		});
		return [];
	}
	// A partial rejection is still a rejection: silently dropping files the user
	// just chose is the worst of the options.
	if (accepted.length < incoming.length) {
		onError?.({
			code: "accept",
			message: i18n._(
				msg({
					message: "Some files are not an accepted type and were not added.",
				}),
			),
		});
	}

	const { maxFileSize } = constraints;
	const sized = maxFileSize
		? accepted.filter((file) => file.size <= maxFileSize)
		: accepted;
	if (accepted.length > 0 && sized.length === 0) {
		onError?.({
			code: "max_file_size",
			message: i18n._(
				msg({
					message: "All files exceed the maximum size.",
				}),
			),
		});
		return [];
	}
	if (sized.length < accepted.length) {
		onError?.({
			code: "max_file_size",
			message: i18n._(
				msg({
					message: "Some files exceed the maximum size and were not added.",
				}),
			),
		});
	}

	if (typeof constraints.maxFiles !== "number") return sized;
	const capacity = Math.max(0, constraints.maxFiles - currentCount);
	if (sized.length > capacity) {
		onError?.({
			code: "max_files",
			message: i18n._(
				msg({
					message: "Too many files. Some were not added.",
				}),
			),
		});
	}
	return sized.slice(0, capacity);
}
