import { useLingui } from "@lingui/react/macro";
import type { UserContent } from "@superset/chat/protocol";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { fileToBase64 } from "../../utils/fileToBase64";

export function useUploadAttachments() {
	const { t } = useLingui();
	const uploadAttachment = workspaceTrpc.attachments.upload.useMutation();

	return useCallback(
		async (files: File[]): Promise<UserContent[] | null> => {
			try {
				return await Promise.all(
					files.map(async (file) => {
						const mimeType = file.type || "application/octet-stream";
						const { attachmentId } = await uploadAttachment.mutateAsync({
							data: { kind: "base64", data: await fileToBase64(file) },
							mediaType: mimeType,
							originalFilename: file.name,
						});
						return {
							type: "attachment" as const,
							attachmentId,
							name: file.name,
							mimeType,
						};
					}),
				);
			} catch (error) {
				toast.error(t({ message: "Couldn't attach files" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
				return null;
			}
		},
		[uploadAttachment, t],
	);
}
