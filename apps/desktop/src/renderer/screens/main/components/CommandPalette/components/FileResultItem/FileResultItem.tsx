import { CommandPrimitive } from "@superset/ui/command";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

interface FileResultItemProps {
	value: string;
	fileName: string;
	relativePath: string;
	onSelect: () => void;
}

export function FileResultItem({
	value,
	fileName,
	relativePath,
	onSelect,
}: FileResultItemProps) {
	return (
		<CommandPrimitive.Item
			value={value}
			onSelect={onSelect}
			className="group data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
		>
			<FileIcon fileName={fileName} className="size-3.5 shrink-0" />
			<span className="max-w-[252px] truncate font-medium">{fileName}</span>
			<span className="truncate text-muted-foreground text-xs">
				{relativePath}
			</span>
			<kbd className="ml-auto hidden shrink-0 text-xs text-muted-foreground group-data-[selected=true]:block">
				↵
			</kbd>
		</CommandPrimitive.Item>
	);
}
