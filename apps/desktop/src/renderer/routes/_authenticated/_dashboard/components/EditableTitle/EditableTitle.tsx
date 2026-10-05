import { useEffect, useState } from "react";

interface EditableTitleProps {
	name: string;
	label: string;
	maxLength: number;
	onRename: (name: string) => void;
}

export function EditableTitle({
	name,
	label,
	maxLength,
	onRename,
}: EditableTitleProps) {
	const [draft, setDraft] = useState(name);
	const [isEditing, setIsEditing] = useState(false);

	useEffect(() => {
		if (!isEditing) setDraft(name);
	}, [name, isEditing]);

	const save = () => {
		setIsEditing(false);
		const next = draft.replace(/\s+/g, " ").trim();
		if (next && next !== name) onRename(next);
		else setDraft(name);
	};

	return (
		<textarea
			value={draft}
			rows={1}
			maxLength={maxLength}
			spellCheck={false}
			aria-label={label}
			onFocus={() => setIsEditing(true)}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={save}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					event.currentTarget.blur();
				} else if (event.key === "Escape") {
					setDraft(name);
					setIsEditing(false);
					requestAnimationFrame(() => event.currentTarget?.blur());
				}
			}}
			className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent p-0 text-[22px] font-semibold leading-snug outline-none"
		/>
	);
}
