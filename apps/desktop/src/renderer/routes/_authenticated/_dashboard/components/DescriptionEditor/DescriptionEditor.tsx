import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { RichText, type RichTextHandle } from "renderer/components/RichText";

const SAVE_AFTER_MS = 800;

interface PendingSave {
	timer: ReturnType<typeof setTimeout>;
	value: string;
}

interface DescriptionEditorProps {
	description: string | null;
	allowAttachments: boolean;
	onSave: (description: string | null) => void;
}

export function DescriptionEditor({
	description,
	allowAttachments,
	onSave,
}: DescriptionEditorProps) {
	const { t } = useLingui();
	const incoming = (description ?? "").trim();
	const richText = useRef<RichTextHandle>(null);
	const saved = useRef(incoming);
	const unconfirmed = useRef<string | null>(null);
	const pending = useRef<PendingSave | null>(null);
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;
	const flush = useRef((value: string) => {
		if (value === saved.current) return;
		saved.current = value;
		unconfirmed.current = value;
		onSaveRef.current(value || null);
	}).current;

	useEffect(() => {
		if (unconfirmed.current !== null) {
			if (incoming !== unconfirmed.current) return;
			unconfirmed.current = null;
		}
		if (pending.current || incoming === saved.current) return;
		saved.current = incoming;
		richText.current?.replaceContent(incoming);
	}, [incoming]);

	useEffect(
		() => () => {
			if (!pending.current) return;
			clearTimeout(pending.current.timer);
			flush(pending.current.value);
		},
		[flush],
	);

	return (
		<RichText
			ref={richText}
			value={description ?? ""}
			allowAttachments={allowAttachments}
			onChange={(markdown) => {
				const value = markdown.trim();
				if (pending.current) clearTimeout(pending.current.timer);
				pending.current = {
					value,
					timer: setTimeout(() => {
						pending.current = null;
						flush(value);
					}, SAVE_AFTER_MS),
				};
			}}
			placeholder={t({ message: "Add a description…" })}
			editorClassName="text-sm leading-relaxed"
		/>
	);
}
