import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";

interface PaneTitleProps {
	name: string;
	fallback: string;
	onRename: (newName: string) => void;
	className?: string;
}

export function PaneTitle({
	name,
	fallback,
	onRename,
	className = "truncate text-sm text-muted-foreground",
}: PaneTitleProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");

	const displayName = name || fallback;

	const startEditing = () => {
		setEditValue(displayName);
		setIsEditing(true);
	};

	const handleSave = () => {
		const trimmedValue = editValue.trim();
		if (trimmedValue && trimmedValue !== displayName) {
			onRename(trimmedValue);
		}
		setIsEditing(false);
	};

	if (isEditing) {
		return (
			<RenameInput
				value={editValue}
				onChange={setEditValue}
				onSubmit={handleSave}
				onCancel={() => setIsEditing(false)}
				maxLength={64}
				className={cn(
					"min-w-0 rounded border border-border bg-background px-1 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring",
					className,
				)}
			/>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: double-click to rename
		<span className={className} onDoubleClick={startEditing}>
			{displayName}
		</span>
	);
}
