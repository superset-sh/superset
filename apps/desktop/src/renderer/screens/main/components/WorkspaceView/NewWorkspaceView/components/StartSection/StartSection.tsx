import { Button } from "@superset/ui/button";
import { FolderOpen } from "lucide-react";

interface StartSectionProps {
	onOpenProject: () => void;
	isLoading?: boolean;
}

export function StartSection({ onOpenProject, isLoading }: StartSectionProps) {
	return (
		<div className="mb-8">
			<h2 className="text-sm font-semibold text-foreground mb-3">Start</h2>
			<div className="space-y-2">
				<Button
					variant="ghost"
					className="w-full justify-start h-auto py-2 px-3"
					onClick={onOpenProject}
					disabled={isLoading}
				>
					<FolderOpen className="h-4 w-4 mr-2" />
					<span>Open Project...</span>
				</Button>
			</div>
		</div>
	);
}
