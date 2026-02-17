import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useState } from "react";
import { CloneRepoTab } from "./components/CloneRepoTab";
import { EmptyRepoTab } from "./components/EmptyRepoTab";
import { TemplateRepoTab } from "./components/TemplateRepoTab";
import type { NewProjectMode } from "./constants";

interface NewProjectDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onError: (error: string) => void;
}

const TABS: { mode: NewProjectMode; label: string }[] = [
	{ mode: "empty", label: "Empty" },
	{ mode: "clone", label: "Clone" },
	{ mode: "template", label: "Template" },
];

export function NewProjectDialog({
	isOpen,
	onClose,
	onError,
}: NewProjectDialogProps) {
	const [mode, setMode] = useState<NewProjectMode>("empty");

	const handleClose = () => {
		onClose();
		setMode("empty");
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="gap-0 p-0 overflow-hidden">
				<DialogHeader className="px-4 pt-4 pb-3">
					<DialogTitle>New Project</DialogTitle>
					<DialogDescription>
						Create a new project or clone an existing repository.
					</DialogDescription>
				</DialogHeader>

				<div className="px-4 pb-3">
					<div className="flex p-0.5 bg-muted rounded-md">
						{TABS.map((tab) => (
							<button
								key={tab.mode}
								type="button"
								onClick={() => setMode(tab.mode)}
								className={`flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
									mode === tab.mode
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{tab.label}
							</button>
						))}
					</div>
				</div>

				{mode === "empty" && (
					<EmptyRepoTab onClose={handleClose} onError={onError} />
				)}
				{mode === "clone" && (
					<CloneRepoTab onClose={handleClose} onError={onError} />
				)}
				{mode === "template" && (
					<TemplateRepoTab onClose={handleClose} onError={onError} />
				)}
			</DialogContent>
		</Dialog>
	);
}
