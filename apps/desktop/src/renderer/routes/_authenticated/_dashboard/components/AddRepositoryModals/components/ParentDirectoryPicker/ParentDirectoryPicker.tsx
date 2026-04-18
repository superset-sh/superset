import { Button } from "@superset/ui/button";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface ParentDirectoryPickerProps {
	value: string | null;
	onChange: (path: string) => void;
	disabled?: boolean;
	dialogTitle?: string;
}

/**
 * Compact inline control: shows the current path as code + a Browse button.
 * Used in project create/setup modals to choose where to clone into.
 */
export function ParentDirectoryPicker({
	value,
	onChange,
	disabled,
	dialogTitle = "Select parent directory",
}: ParentDirectoryPickerProps) {
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	const handleBrowse = async () => {
		const result = await selectDirectory.mutateAsync({
			title: dialogTitle,
			defaultPath: value ?? undefined,
		});
		if (!result.canceled && result.path) {
			onChange(result.path);
		}
	};

	return (
		<div className="flex items-center gap-2">
			<code className="flex-1 min-w-0 truncate rounded bg-muted px-2 py-1.5 text-xs">
				{value ?? "No directory selected"}
			</code>
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={handleBrowse}
				disabled={disabled || selectDirectory.isPending}
			>
				Browse…
			</Button>
		</div>
	);
}
