import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { MAX_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";
import { File } from "expo-file-system";
import type { PromptInputAttachmentItem } from "@/components/ai-elements/prompt-input";
import { apiClient } from "@/lib/trpc/client";
import {
	type AttachmentUpload,
	useComposerDraftsStore,
} from "@/screens/(authenticated)/stores/composerDraftsStore";

const FALLBACK_MEDIA_TYPE = "application/octet-stream";

/**
 * In-flight uploads, so removing an attachment can stop the transfer rather
 * than paying for bytes nobody will read. Not in the store: a controller is
 * not state anything renders, and it does not survive a reload the way the
 * progress beside it is meant to.
 */
const controllers = new Map<string, AbortController>();

/**
 * The name to store an attachment under when the picker gave us none. The
 * uri's last segment is what the user would recognize; a generated name is
 * the last resort, and the host renames anything unusable anyway.
 */
function nameOf(attachment: PromptInputAttachmentItem, index: number): string {
	if (attachment.name) return attachment.name;
	const fromUri = decodeURIComponent(
		attachment.uri.split("?")[0]?.split("/").pop() ?? "",
	);
	return fromUri || `attachment_${index + 1}`;
}

/**
 * The backstop for what `useComposerDraft` already refuses at pick time.
 * It reaches here only when the picker reported no size and the file could
 * not be measured until now.
 */
function assertSendable(file: File): void {
	// 0 is what `size` reports for a file it cannot read, not an empty one —
	// either way there is nothing to upload.
	if (file.size <= 0) {
		throw new Error(i18n._(msg({ message: "Unable to read file" })));
	}
	if (file.size > MAX_ATTACHMENT_BYTES) {
		throw new Error(i18n._(msg({ message: "Attachment is too large" })));
	}
}

/**
 * Sends one attachment's bytes to cloud storage, reporting into the draft.
 *
 * The bytes go straight from the device to R2 over a presigned PUT, which is
 * why an attachment can be large at all: the relay buffers whole request
 * bodies in a Cloudflare Worker, and its edge refuses anything over 100 MB
 * outright — a limit base64 in JSON reaches at 75 MB of actual file. What
 * crosses the relay afterwards is a list of ids.
 *
 * `File.upload` streams from disk natively, so nothing here is ever held in
 * the JS heap, and iOS keeps the transfer going when the app is backgrounded.
 */
async function upload(
	draftKey: string,
	attachment: PromptInputAttachmentItem,
	index: number,
): Promise<void> {
	const store = useComposerDraftsStore.getState();
	const controller = new AbortController();
	controllers.set(attachment.id, controller);
	// Synchronously, before the first await: a retry has to clear the previous
	// failure here, or a send that starts one still reads the old error and
	// gives up without waiting for it.
	store.beginUpload(draftKey, attachment.id);

	try {
		const file = new File(attachment.uri);
		const name = nameOf(attachment, index);
		assertSendable(file);

		const { fileId, upload: target } =
			await apiClient.attachment.createUpload.mutate({
				name,
				contentType: attachment.mediaType ?? FALLBACK_MEDIA_TYPE,
				sizeBytes: file.size,
			});

		let reported = -1;
		const result = await file.upload(target.url, {
			httpMethod: "PUT",
			headers: target.headers,
			signal: controller.signal,
			onProgress: ({ bytesSent, totalBytes }) => {
				if (totalBytes <= 0) return;
				// Held below 1 until the id is in hand: a full ring on an
				// attachment a send would still have to wait for reads as done.
				const fraction = Math.min(bytesSent / totalBytes, 0.99);
				// iOS reports every 100ms per upload, and each report re-renders
				// the composer and re-sends the whole tray across the bridge to
				// SwiftUI. A ring 80pt wide cannot show more than whole percent
				// anyway, so anything finer is traffic nobody can see.
				const percent = Math.floor(fraction * 100);
				if (percent === reported) return;
				reported = percent;
				store.setUploadProgress(draftKey, attachment.id, fraction);
			},
		});
		// The presigned PUT answers 200; anything else means the object is not
		// there and `attachment.resolve` would refuse it later, further from
		// the cause.
		if (result.status < 200 || result.status >= 300) {
			throw new Error(`Upload failed for ${name} (${result.status})`);
		}

		store.finishUpload(draftKey, attachment.id, fileId);
	} catch (error) {
		// A cancelled upload belongs to an attachment that is already gone;
		// its entry went with it and there is nothing to report.
		if (controller.signal.aborted) return;
		store.failUpload(
			draftKey,
			attachment.id,
			error instanceof Error ? error.message : String(error),
		);
	} finally {
		controllers.delete(attachment.id);
	}
}

/**
 * Begins uploading newly attached files. Called as they are attached, so the
 * transfer runs while the message is still being written — on a large file
 * that is the difference between a send that returns and one that holds the
 * composer for minutes.
 */
export function startAttachmentUploads(
	draftKey: string,
	attachments: PromptInputAttachmentItem[],
): void {
	for (const [index, attachment] of attachments.entries()) {
		if (controllers.has(attachment.id)) continue;
		void upload(draftKey, attachment, index);
	}
}

/** Stops an upload whose attachment was removed from the tray. */
export function cancelAttachmentUpload(attachmentId: string): void {
	controllers.get(attachmentId)?.abort();
	controllers.delete(attachmentId);
}

/**
 * The file ids for a send, waiting on whatever is still in flight and
 * retrying whatever failed while the message was being written.
 *
 * Returns them in the order asked for: the host names attachments
 * positionally, and a reordered list would rename them.
 */
export async function awaitAttachmentUploads(
	draftKey: string,
	attachments: PromptInputAttachmentItem[],
): Promise<string[]> {
	if (attachments.length === 0) return [];

	const uploadsNow = () =>
		useComposerDraftsStore.getState().draftsByKey[draftKey]?.uploads ?? {};
	// A failure earlier in the draft's life is worth one more try now that the
	// user has actually asked to send: the usual cause is a connection that
	// has since come back.
	const stale = uploadsNow();
	startAttachmentUploads(
		draftKey,
		// Only entries the draft still holds: `beginUpload` refuses to write
		// state for an attachment that is gone, so starting one would upload
		// bytes nothing could ever wait on.
		attachments.filter((item) => stale[item.id]?.error !== undefined),
	);

	const settled = (uploads: Record<string, AttachmentUpload>) =>
		attachments.every((item) => {
			const entry = uploads[item.id];
			// A vanished entry counts as settled — the attachment was removed
			// mid-send, and waiting on it would hang the composer.
			return !entry || entry.fileId !== undefined || entry.error !== undefined;
		});

	const uploads = await new Promise<Record<string, AttachmentUpload>>(
		(resolve) => {
			// Read back rather than reusing the snapshot above: anything just
			// restarted has had its error cleared and is no longer settled.
			const current = uploadsNow();
			if (settled(current)) return resolve(current);
			const unsubscribe = useComposerDraftsStore.subscribe((state) => {
				const current = state.draftsByKey[draftKey]?.uploads ?? {};
				if (!settled(current)) return;
				unsubscribe();
				resolve(current);
			});
		},
	);

	return attachments.map((item) => {
		const entry = uploads[item.id];
		if (!entry?.fileId) {
			throw new Error(
				entry?.error ??
					i18n._(msg({ message: "Attachment is no longer available" })),
			);
		}
		return entry.fileId;
	});
}
