import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useRef, useState } from "react";
import { HiOutlinePaperClip } from "react-icons/hi2";
import { LuArrowUp } from "react-icons/lu";
import { RichText, type RichTextHandle } from "renderer/components/RichText";

interface TaskCommentComposerProps {
	placeholder: string;
	submitLabel: string;
	initialBody?: string;
	autoFocus?: boolean;
	className?: string;
	leading?: ReactNode;
	onSubmit: (body: string) => Promise<void>;
	onCancel?: () => void;
}

export function TaskCommentComposer({
	placeholder,
	submitLabel,
	initialBody = "",
	autoFocus = false,
	className,
	leading,
	onSubmit,
	onCancel,
}: TaskCommentComposerProps) {
	const { t } = useLingui();
	const [body, setBody] = useState(initialBody);
	const [editorKey, setEditorKey] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const richTextRef = useRef<RichTextHandle>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const canSubmit = !isSubmitting && !isUploading && body.trim().length > 0;

	const submit = async () => {
		if (!canSubmit) return;
		setIsSubmitting(true);
		try {
			await onSubmit(body.trim());
			setBody("");
			setEditorKey((key) => key + 1);
		} catch {
			// The caller reported the failure; the draft stays so nothing is lost.
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div
			className={cn(
				"rounded-lg border border-border bg-card/60 px-3 pt-2 pb-2",
				className,
			)}
		>
			<div className="flex gap-3">
				{leading}
				<RichText
					key={editorKey}
					ref={richTextRef}
					value={initialBody}
					onChange={setBody}
					onUploadingChange={setIsUploading}
					onModEnter={() => void submit()}
					placeholder={placeholder}
					allowAttachments
					autoFocus={autoFocus}
					className="min-w-0 flex-1"
					editorClassName="min-h-[2lh] text-[13.5px] leading-normal"
				/>
			</div>
			<div className="mt-1 flex items-center justify-end gap-1.5">
				<input
					ref={fileInputRef}
					type="file"
					multiple
					hidden
					onChange={(event) => {
						richTextRef.current?.attachFiles([...(event.target.files ?? [])]);
						event.target.value = "";
					}}
				/>
				<Button
					variant="outline"
					size="icon-sm"
					className="mr-auto text-muted-foreground"
					aria-label={t({ message: "Attach files" })}
					onClick={() => fileInputRef.current?.click()}
				>
					<HiOutlinePaperClip className="size-4" />
				</Button>
				{onCancel && (
					<Button variant="ghost" size="sm" onClick={onCancel}>
						<Trans>Cancel</Trans>
					</Button>
				)}
				<Button
					size="icon-sm"
					className="rounded-full"
					aria-label={submitLabel}
					disabled={!canSubmit}
					onClick={() => void submit()}
				>
					<LuArrowUp className="size-4" />
				</Button>
			</div>
		</div>
	);
}
