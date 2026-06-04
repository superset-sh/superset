export const WORKSPACE_FS_RESOURCE_SCHEME = "workspace-fs";

const WINDOWS_DRIVE_PREFIX = /^([A-Za-z]):(?:\/|$)/;

export interface WorkspaceFsResourceUriParts {
	workspaceId: string;
	absolutePath: string;
}

function normalizeResourceAbsolutePath(input: string): string {
	const normalizedPath = input.replace(/\\/g, "/");
	if (!normalizedPath) {
		return normalizedPath;
	}

	let prefix = "";
	let remainder = normalizedPath;

	const windowsPathWithLeadingSlash = normalizedPath.match(
		/^\/([A-Za-z]):(?:\/|$)/,
	);
	if (normalizedPath.startsWith("//")) {
		prefix = "//";
		remainder = normalizedPath.slice(2);
	} else if (windowsPathWithLeadingSlash) {
		prefix = `${windowsPathWithLeadingSlash[1]?.toLowerCase()}:`;
		remainder = normalizedPath.slice(windowsPathWithLeadingSlash[0].length);
	} else if (normalizedPath.startsWith("/")) {
		prefix = "/";
		remainder = normalizedPath.slice(1);
	} else {
		const driveMatch = normalizedPath.match(WINDOWS_DRIVE_PREFIX);
		if (driveMatch) {
			prefix = `${driveMatch[1]?.toLowerCase()}:`;
			remainder = normalizedPath.slice(driveMatch[0].length);
		}
	}

	const normalizedSegments: string[] = [];
	for (const segment of remainder.split("/")) {
		if (!segment || segment === ".") {
			continue;
		}

		if (segment === "..") {
			const lastSegment = normalizedSegments.at(-1);
			if (lastSegment && lastSegment !== "..") {
				normalizedSegments.pop();
				continue;
			}
		}

		normalizedSegments.push(segment);
	}

	const normalizedSuffix = normalizedSegments.join("/");
	if (prefix === "//") {
		return normalizedSuffix ? `//${normalizedSuffix}` : "//";
	}

	if (prefix === "/") {
		return normalizedSuffix ? `/${normalizedSuffix}` : "/";
	}

	if (prefix) {
		return normalizedSuffix ? `${prefix}/${normalizedSuffix}` : `${prefix}/`;
	}

	return normalizedSuffix;
}

export function toWorkspaceFsResourceUri(
	parts: WorkspaceFsResourceUriParts,
): string {
	const normalizedAbsolutePath = normalizeResourceAbsolutePath(
		parts.absolutePath,
	);
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
	const absolutePath = normalizeResourceAbsolutePath(
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
