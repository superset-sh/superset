import { hashString } from "renderer/routes/_authenticated/_dashboard/utils/hashString";

interface FileItemVersionInput {
	contentKey: string;
	annotations: readonly unknown[] | undefined;
	collapsed: boolean;
}

export function getFileItemVersion({
	contentKey,
	annotations,
	collapsed,
}: FileItemVersionInput): number {
	return hashString(
		[
			contentKey,
			collapsed ? "1" : "0",
			annotations?.length ? JSON.stringify(annotations) : "",
		].join("\0"),
	);
}
