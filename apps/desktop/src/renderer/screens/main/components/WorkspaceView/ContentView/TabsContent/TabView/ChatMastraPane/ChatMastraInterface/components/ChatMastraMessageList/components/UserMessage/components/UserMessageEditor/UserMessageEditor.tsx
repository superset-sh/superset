import { Button } from "@superset/ui/button";
import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
	const inputRef = useRef<HTMLInputElement>(null);
	const files = initialDraft.files;

	useEffect(() => {
		setText(initialDraft.text);
	}, [initialDraft.text]);

	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		input.focus();
		input.setSelectionRange(input.value.length, input.value.length);
	}, []);

	const canSubmit = Boolean(text.trim() || files.length > 0);
	const handleSubmit = () => {
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
	};

	return (
		<div className="flex w-full max-w-[85%] flex-col gap-2">
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
			<input
				ref={inputRef}
				type="text"
				value={text}
				onChange={(event) => setText(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
						return;
					}
					if (event.key !== "Enter") return;
					event.preventDefault();
					handleSubmit();
				}}
				placeholder="Edit message..."
				className="h-9 w-full rounded-xl border border-transparent bg-muted/45 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-border focus:bg-background/70"
			/>
			<div className="flex justify-end gap-1">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs text-muted-foreground"
					onClick={onCancel}
					disabled={isSubmitting}
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					onClick={handleSubmit}
					disabled={!canSubmit || isSubmitting}
				>
					{isSubmitting ? (
						<>
							<Loader2Icon className="size-4 animate-spin" />
							Sending
						</>
					) : (
						"Send"
					)}
				</Button>
			</div>
		</div>
	);
}
