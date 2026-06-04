import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { LightDiffViewer } from "renderer/screens/main/components/WorkspaceView/ChangesContent/components/LightDiffViewer";
import { detectLanguage } from "shared/detect-language";

interface FileSaveConflictDialogProps {
	open: boolean;
	filePath: string;
	localContent: string;
	diskContent: string | null;
	isSaving?: boolean;
	onOpenChange: (open: boolean) => void;
	onKeepEditing: () => void;
	onReloadFromDisk: () => void;
	onOverwrite: () => void;
}

export function FileSaveConflictDialog({
	open,
	filePath,
	localContent,
	diskContent,
	isSaving = false,
	onOpenChange,
	onKeepEditing,
	onReloadFromDisk,
	onOverwrite,
}: FileSaveConflictDialogProps) {
	const currentDiskContent = diskContent ?? "";

	return (
		<Dialog
			open={open}
			onOpenChange={isSaving ? undefined : onOpenChange}
			modal
		>
			<DialogContent className="max-w-[min(1100px,calc(100vw-2rem))] p-0">
				<div className="flex max-h-[85vh] flex-col">
					<DialogHeader className="border-b px-6 pt-6">
						<DialogTitle>File Changed On Disk</DialogTitle>
						<DialogDescription>
							{diskContent === null
								? `${filePath} was removed or is no longer readable. Review the difference before choosing whether to overwrite it.`
								: `${filePath} changed on disk after you started editing. Review the diff before saving.`}
						</DialogDescription>
					</DialogHeader>
					<div className="min-h-0 flex-1 overflow-auto">
						<LightDiffViewer
							contents={{
								original: currentDiskContent,
								modified: localContent,
								language: detectLanguage(filePath),
							}}
							viewMode="inline"
							hideUnchangedRegions={false}
							filePath={filePath}
							className="min-h-full"
						/>
					</div>
					<DialogFooter className="border-t px-6 py-4">
						<Button
							variant="outline"
							onClick={onKeepEditing}
							disabled={isSaving}
						>
							Keep Editing
						</Button>
						<Button
							variant="outline"
							onClick={onReloadFromDisk}
							disabled={isSaving}
						>
							Reload From Disk
						</Button>
						<Button onClick={onOverwrite} disabled={isSaving}>
							Overwrite File
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
