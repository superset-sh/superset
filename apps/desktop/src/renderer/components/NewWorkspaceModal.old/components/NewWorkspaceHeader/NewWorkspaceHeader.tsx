import { Button } from "@superset/ui/button";
import { DialogHeader, DialogTitle } from "@superset/ui/dialog";
import { HiChevronLeft } from "react-icons/hi2";
import { LuFolderOpen } from "react-icons/lu";

interface NewWorkspaceHeaderProps {
	mode: "new" | "existing";
	hasSelectedProject: boolean;
	onBackToNew: () => void;
	onOpenImport: () => void;
}

export function NewWorkspaceHeader({
	mode,
	hasSelectedProject,
	onBackToNew,
	onOpenImport,
}: NewWorkspaceHeaderProps) {
	return (
		<DialogHeader className="px-4 pt-4 pb-3 flex-row items-center justify-between space-y-0">
			{hasSelectedProject && mode === "existing" && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					onClick={onBackToNew}
				>
					<HiChevronLeft className="size-3.5" />
					Back
				</Button>
			)}
			<DialogTitle className={mode === "existing" ? "sr-only" : "text-base"}>
				New Workspace
			</DialogTitle>
			{hasSelectedProject && mode === "new" && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					onClick={onOpenImport}
				>
					<LuFolderOpen className="size-3.5" />
					Import
				</Button>
			)}
			{hasSelectedProject && mode === "existing" && (
				<div className="h-7 w-[56px]" />
			)}
		</DialogHeader>
	);
}
