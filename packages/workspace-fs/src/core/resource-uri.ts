import { normalizeAbsolutePath } from "../paths";

export const WORKSPACE_FS_RESOURCE_SCHEME = "workspace-fs";

export interface WorkspaceFsResourceUriParts {
	workspaceId: string;
	absolutePath: string;
}

export function toWorkspaceFsResourceUri(
	parts: WorkspaceFsResourceUriParts,
): string {
	const normalizedAbsolutePath = normalizeAbsolutePath(
		parts.absolutePath,
	).replace(/\\/g, "/");
	const normalizedWorkspaceId = encodeURIComponent(parts.workspaceId);
	const encodedAbsolutePath = normalizedAbsolutePath
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	return `${WORKSPACE_FS_RESOURCE_SCHEME}://${normalizedWorkspaceId}${encodedAbsolutePath.startsWith("/") ? "" : "/"}${encodedAbsolutePath}`;
}

export function parseWorkspaceFsResourceUri(
	resourceUri: string,
): WorkspaceFsResourceUriParts | null {
	const prefix = `${WORKSPACE_FS_RESOURCE_SCHEME}://`;
	if (!resourceUri.startsWith(prefix)) {
		return null;
	}

	const remainder = resourceUri.slice(prefix.length);
	const firstSlashIndex = remainder.indexOf("/");
	if (firstSlashIndex <= 0) {
		return null;
	}

	const workspaceId = decodeURIComponent(remainder.slice(0, firstSlashIndex));
	const encodedAbsolutePath = remainder.slice(firstSlashIndex);
	const absolutePath = normalizeAbsolutePath(
		encodedAbsolutePath
			.split("/")
			.map((segment) => decodeURIComponent(segment))
			.join("/"),
	);

	return {
		workspaceId,
		absolutePath,
	};
}
