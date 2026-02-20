import {
	CommandDialog,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { getFileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils/file-icons";

interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	query: string;
	onQueryChange: (query: string) => void;
	searchResults: Array<{
		id: string;
		name: string;
		relativePath: string;
		path: string;
		isDirectory: boolean;
		score: number;
	}>;
	onSelectFile: (filePath: string) => void;
}

export function CommandPalette({
	open,
	onOpenChange,
	query,
	onQueryChange,
	searchResults,
	onSelectFile,
}: CommandPaletteProps) {
	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Quick Open"
			description="Search for files in your workspace"
			showCloseButton={false}
		>
			<CommandInput
				placeholder="Search files..."
				value={query}
				onValueChange={onQueryChange}
			/>
			<CommandList>
				{query.trim().length > 0 && searchResults.length === 0 && (
					<CommandEmpty>No files found.</CommandEmpty>
				)}
				{searchResults.map((file) => {
					const { icon: Icon, color } = getFileIcon(file.name, false);
					return (
						<CommandItem
							key={file.id}
							value={file.path}
							onSelect={() => onSelectFile(file.relativePath)}
						>
							<Icon className={`size-3.5 shrink-0 ${color}`} />
							<span className="truncate font-medium">{file.name}</span>
							<span className="truncate text-muted-foreground text-xs ml-auto">
								{file.relativePath}
							</span>
						</CommandItem>
					);
				})}
			</CommandList>
		</CommandDialog>
	);
}
