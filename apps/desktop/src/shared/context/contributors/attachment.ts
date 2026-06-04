import type { AttachmentFile, ContentPart, ContextContributor } from "../types";

export const attachmentContributor: ContextContributor<{
	kind: "attachment";
	file: AttachmentFile;
}> = {
	kind: "attachment",
	displayName: "Attachment",
	description: "A file or image uploaded by the user.",
	requiresQuery: false,
	async resolve(source) {
		const { file } = source;
		const part: ContentPart = file.mediaType.startsWith("image/")
			? { type: "image", data: file.data, mediaType: file.mediaType }
			: {
					type: "file",
					data: file.data,
					mediaType: file.mediaType,
					filename: file.filename,
				};

		return {
			id: `attachment:${file.filename ?? "unnamed"}`,
			kind: "attachment",
			label: file.filename ?? "attachment",
			content: [part],
		};
	},
};
