import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { CLIError } from "@superset/cli-framework";
import mimeTypes from "mime-types";
import type { HostServiceClient } from "./host-target";

export interface PrepareAttachmentIdsOptions {
	attachmentIds?: string[];
	attachmentPaths?: string[];
}

export async function uploadAttachments(
	client: HostServiceClient,
	paths: string[],
): Promise<string[]> {
	if (paths.length === 0) return [];
	const ids: string[] = [];
	for (const path of paths) {
		const filename = basename(path);
		const mediaType = mimeTypes.lookup(filename);
		if (!mediaType) {
			throw new CLIError(
				`Could not determine media type for attachment: ${path}`,
				"Use a recognizable file extension (e.g. .png, .pdf, .md)",
			);
		}
		const bytes = readFileSync(path);
		const result = await client.attachments.upload.mutate({
			data: { kind: "base64", data: bytes.toString("base64") },
			mediaType,
			originalFilename: filename,
		});
		ids.push(result.attachmentId);
	}
	return ids;
}

/**
 * Resolve the two public CLI attachment forms into the host IDs consumed by
 * agent launch procedures. Existing IDs stay first and local paths are
 * uploaded in argument order, giving `agents create` and `workspaces create`
 * one ordering and error contract.
 */
export async function prepareAttachmentIds(
	client: HostServiceClient,
	options: PrepareAttachmentIdsOptions,
): Promise<string[]> {
	const uploadedIds = await uploadAttachments(
		client,
		options.attachmentPaths ?? [],
	);
	return [...(options.attachmentIds ?? []), ...uploadedIds];
}
