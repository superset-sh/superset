import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";

export type AttachmentTag = { path: string; type: string };

const TAG = /<attachment path="([^"]+)"(?: type="([^"]*)")? \/>/g;
const SAFE_TYPE = /^[\w.+-]+\/[\w.+-]+$/;
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function isWorkspaceAttachmentPath(path: string): boolean {
	const prefix = `${WORKSPACE_ATTACHMENTS_DIR}/`;
	if (!path.startsWith(prefix)) return false;
	const name = path.slice(prefix.length);
	return SAFE_NAME.test(name) && name !== "." && name !== "..";
}

export function formatAttachmentTag({ path, type }: AttachmentTag): string {
	return SAFE_TYPE.test(type)
		? `<attachment path="${path}" type="${type}" />`
		: `<attachment path="${path}" />`;
}

export function parseAttachmentTags(text: string): {
	text: string;
	attachments: AttachmentTag[];
} {
	const attachments: AttachmentTag[] = [];
	const rest = text.replace(
		TAG,
		(match: string, path: string, type?: string) => {
			if (!isWorkspaceAttachmentPath(path)) return match;
			attachments.push({ path, type: type ?? "" });
			return "";
		},
	);
	return { text: rest.trim(), attachments };
}
