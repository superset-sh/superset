import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useSendAttachments } from "../../../../../../hooks/useSendAttachments";
import { AttachmentLimitError } from "../../../../../../utils/sendAttachmentsToWorkspace";
import { formatAttachmentTag } from "../../../../utils/attachmentTags";

export function useUploadAttachments(workspaceId: string) {
	const { t } = useLingui();
	const sendAttachments = useSendAttachments(workspaceId);

	return useCallback(
		async (files: File[]): Promise<string[] | null> => {
			if (files.length === 0) return [];
			try {
				const paths = await sendAttachments(files);
				return paths.map((path, index) =>
					formatAttachmentTag({ path, type: files[index]?.type ?? "" }),
				);
			} catch (error) {
				toast.error(t({ message: "Couldn't attach files" }), {
					description:
						error instanceof AttachmentLimitError
							? error.message
							: errorMessage(error, t({ message: "Unknown error" })),
				});
				return null;
			}
		},
		[sendAttachments, t],
	);
}
