import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GitMerge, GitPullRequest } from "lucide-react";
import type React from "react";

interface PRActionsProps {
	hasPR: boolean;
	canCreatePR: boolean;
	selectedBranch?: string;
	onCreatePR?: () => void;
	onMergePR?: () => void;
}

export const PRActions: React.FC<PRActionsProps> = ({
	hasPR,
	canCreatePR,
	selectedBranch,
	onCreatePR,
	onMergePR,
}) => {
	if (hasPR && onMergePR) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="default"
						size="sm"
						onClick={onMergePR}
						className="h-7 bg-green-600 hover:bg-green-700 text-white"
					>
						<GitMerge size={14} className="mr-1.5" />
						Merge PR
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p>Merge pull request for {selectedBranch}</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	if (onCreatePR) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="default"
						size="sm"
						onClick={onCreatePR}
						disabled={!canCreatePR}
						className="h-7"
					>
						<GitPullRequest size={14} className="mr-1.5" />
						Create PR
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p>
						{canCreatePR
							? `Create pull request for ${selectedBranch}`
							: "Select a worktree to create a PR"}
					</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	return null;
};
