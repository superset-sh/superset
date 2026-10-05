import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Selection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import {
	type FileMentionSearchFn,
	MarkdownEditor,
} from "renderer/components/MarkdownEditor";
import { useRecordMentionSearch } from "./hooks/useRecordMentionSearch";
import { uploadFile } from "./utils/uploadFile";

export interface RichTextHandle {
	attachFiles: (files: File[]) => void;
	replaceContent: (markdown: string) => void;
}

interface RichTextProps {
	value: string;
	onChange?: (markdown: string) => void;
	onBlur?: (markdown: string) => void;
	placeholder?: string;
	editable?: boolean;
	allowAttachments?: boolean;
	autoFocus?: boolean;
	onModEnter?: () => void;
	/** Enables @-mentioning a file from the project. */
	searchFiles?: FileMentionSearchFn;
	className?: string;
	editorClassName?: string;
	onUploadingChange?: (uploading: boolean) => void;
}

/**
 * Markdown documents everywhere in the app: descriptions, comments, summaries.
 * With attachments allowed, pasted, dropped and attached files upload and go
 * into the document where the cursor is: images inline, anything else as a link.
 */
export const RichText = forwardRef<RichTextHandle, RichTextProps>(
	function RichText(
		{
			value,
			onChange,
			onBlur,
			placeholder,
			editable = true,
			allowAttachments = false,
			autoFocus = false,
			onModEnter,
			searchFiles,
			className,
			editorClassName,
			onUploadingChange,
		},
		ref,
	) {
		const { t } = useLingui();
		const editorHandle = useRef<Editor | null>(null);
		const [uploading, setUploading] = useState(0);
		const searchMentions = useRecordMentionSearch();
		const isUploading = uploading > 0;
		const onUploadingChangeRef = useRef(onUploadingChange);
		onUploadingChangeRef.current = onUploadingChange;

		useEffect(() => {
			onUploadingChangeRef.current?.(isUploading);
		}, [isUploading]);

		useEffect(
			() => () => {
				editorHandle.current = null;
			},
			[],
		);

		const insertFiles = async (files: File[], position: number | null) => {
			setUploading((count) => count + files.length);
			let at = position;
			for (const file of files) {
				try {
					const url = await uploadFile(file);
					const editor = editorHandle.current;
					if (!editor) continue;
					const end = editor.state.doc.content.size;
					const target = Math.min(at ?? editor.state.selection.to, end);
					const content = file.type.startsWith("image/")
						? { type: "image", attrs: { src: url, alt: file.name } }
						: {
								type: "text",
								text: file.name,
								marks: [{ type: "link", attrs: { href: url } }],
							};
					editor.chain().focus().insertContentAt(target, content).run();
					const { state, view } = editor;
					view.dispatch(
						state.tr.setSelection(
							Selection.near(state.doc.resolve(state.selection.to), 1),
						),
					);
					at = null;
				} catch (error) {
					console.error("[RichText] upload failed:", error);
					const name = file.name;
					toast.error(t({ message: `Couldn't upload ${name}` }));
				} finally {
					setUploading((count) => count - 1);
				}
			}
		};

		useImperativeHandle(ref, () => ({
			attachFiles: (files) => void insertFiles(files, null),
			replaceContent: (markdown) => {
				editorHandle.current?.commands.setContent(markdown, {
					emitUpdate: false,
				});
			},
		}));

		return (
			<div className={className}>
				<MarkdownEditor
					content={value}
					onChange={onChange}
					onSave={onBlur}
					placeholder={editable ? placeholder : ""}
					editable={editable}
					autoFocus={autoFocus}
					onModEnter={onModEnter}
					searchFiles={searchFiles}
					searchMentions={editable ? searchMentions : undefined}
					editorHandle={editorHandle}
					onPasteFiles={
						editable && allowAttachments
							? (files) => void insertFiles(files, null)
							: undefined
					}
					onDropFiles={
						editable && allowAttachments
							? (files, position) => void insertFiles(files, position)
							: undefined
					}
					features={{
						fileMention: searchFiles !== undefined,
						slashCommand: editable,
						emoji: editable,
						bubbleMenu: editable,
					}}
					editorClassName={editorClassName}
				/>
				{isUploading && (
					<p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
						<Spinner className="size-3" />
						{t({
							message: plural(uploading, {
								one: "Uploading # file…",
								other: "Uploading # files…",
							}),
						})}
					</p>
				)}
			</div>
		);
	},
);
