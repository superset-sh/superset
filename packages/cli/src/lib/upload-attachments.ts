import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { CLIError } from "@superset/cli-framework";
import mimeTypes from "mime-types";
import type { HostServiceClient } from "./host-target";

/**
 * Upload local files to the target host's attachment store and return the
 * resulting attachment ids in the same order. The host stores bytes per
 * org and returns opaque UUIDs the agent runner resolves on the host
 * side. CLI never sees the on-disk path.
 */
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
