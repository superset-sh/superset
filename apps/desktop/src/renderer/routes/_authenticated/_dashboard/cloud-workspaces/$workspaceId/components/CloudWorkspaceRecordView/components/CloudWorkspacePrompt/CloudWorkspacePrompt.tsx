import { RichText } from "renderer/components/RichText";
import { RecordAttachments } from "renderer/routes/_authenticated/_dashboard/components/RecordAttachments";
import type { CloudWorkspaceRecordAttachment } from "../../../../types";

interface CloudWorkspacePromptProps {
	prompt: string | null;
	attachments: CloudWorkspaceRecordAttachment[];
	onOpenAttachment: (attachmentId: string) => void;
	onDownloadAttachment: (attachmentId: string) => Promise<void>;
}

export function CloudWorkspacePrompt({
	prompt,
	attachments,
	onOpenAttachment,
	onDownloadAttachment,
}: CloudWorkspacePromptProps) {
	return (
		<div className="rounded-lg border border-border bg-card/60 px-3.5 py-3">
			{attachments.length > 0 && (
				<div className="mb-3">
					<RecordAttachments
						attachments={attachments}
						onOpenAttachment={onOpenAttachment}
						onDownloadAttachment={onDownloadAttachment}
					/>
				</div>
			)}
			{prompt && (
				<RichText
					value={prompt}
					editable={false}
					editorClassName="text-[13.5px] leading-normal text-foreground"
				/>
			)}
		</div>
	);
}
