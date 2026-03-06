import { Button } from "@superset/ui/button";
import type { FileUIPart } from "ai";
import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import type { UserMessageActionPayload } from "../../../../ChatMastraMessageList.types";
import { AttachmentChip } from "../../../AttachmentChip";
import type { UserMessageDraft } from "../../utils/getUserMessageDraft/getUserMessageDraft";

interface UserMessageEditorProps {
	initialDraft: UserMessageDraft;
	isSubmitting: boolean;
	onCancel: () => void;
	onSubmit: (payload: UserMessageActionPayload) => Promise<void>;
}

export function UserMessageEditor({
	initialDraft,
	isSubmitting,
	onCancel,
	onSubmit,
}: UserMessageEditorProps) {
	const [text, setText] = useState(initialDraft.text);
	const [files, setFiles] = useState<FileUIPart[]>(initialDraft.files);

	useEffect(() => {
		setText(initialDraft.text);
		setFiles(initialDraft.files);
	}, [initialDraft]);

	const canSubmit = Boolean(text.trim() || files.length > 0);

	return (
		<div className="flex w-full max-w-[85%] flex-col gap-3 rounded-2xl border border-border bg-background px-3 py-3 shadow-sm">
			{files.length > 0 ? (
				<div className="flex flex-wrap justify-end gap-2">
					{files.map((file, index) => (
						<AttachmentChip
							key={`${file.url}-${index}`}
							data={file.url}
							mediaType={file.mediaType}
							filename={file.filename}
						/>
					))}
				</div>
			) : null}
			<textarea
				value={text}
				onChange={(event) => setText(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key !== "Enter" || event.shiftKey) return;
					event.preventDefault();
					if (!canSubmit || isSubmitting) return;
					void onSubmit({
						content: text,
						...(files.length > 0
							? {
									files: files.map((file) => ({
										data: file.url,
										mediaType: file.mediaType,
										filename: file.filename,
										uploaded: false as const,
									})),
								}
							: {}),
					});
				}}
				placeholder="Edit message..."
				className="min-h-24 w-full resize-y rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
			/>
			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onCancel}
					disabled={isSubmitting}
				>
					Cancel
				</Button>
				<Button
					type="button"
					size="sm"
					onClick={() =>
						void onSubmit({
							content: text,
							...(files.length > 0
								? {
										files: files.map((file) => ({
											data: file.url,
											mediaType: file.mediaType,
											filename: file.filename,
											uploaded: false as const,
										})),
									}
								: {}),
						})
					}
					disabled={!canSubmit || isSubmitting}
				>
					{isSubmitting ? (
						<>
							<Loader2Icon className="size-4 animate-spin" />
							Saving
						</>
					) : (
						"Save"
					)}
				</Button>
			</div>
		</div>
	);
}
