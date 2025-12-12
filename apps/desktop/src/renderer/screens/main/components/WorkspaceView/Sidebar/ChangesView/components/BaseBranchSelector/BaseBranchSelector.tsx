import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { trpc } from "renderer/lib/trpc";
import { useChangesStore } from "renderer/stores/changes";

interface BaseBranchSelectorProps {
	worktreePath: string;
}

export function BaseBranchSelector({ worktreePath }: BaseBranchSelectorProps) {
	const { baseBranch, setBaseBranch } = useChangesStore();

	const { data: branchData, isLoading } = trpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath },
	);

	if (isLoading || !branchData) {
		return null;
	}

	// Use the stored baseBranch or fall back to auto-detected default
	const effectiveBranch = baseBranch ?? branchData.defaultBranch;

	// Combine remote branches for selection (these are the ones we can compare against)
	const availableBranches = branchData.remote;

	const handleChange = (value: string) => {
		// If selecting the auto-detected default, store null to indicate "use default"
		if (value === branchData.defaultBranch && baseBranch === null) {
			return;
		}
		setBaseBranch(value);
	};

	return (
		<div className="flex items-center gap-1.5 text-xs">
			<span className="text-muted-foreground">from</span>
			<Select value={effectiveBranch} onValueChange={handleChange}>
				<SelectTrigger
					size="sm"
					className="h-6 px-2 py-0 text-xs font-medium border-none bg-muted/50 hover:bg-muted text-foreground min-w-0 w-auto gap-1 rounded-md"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent align="start">
					{availableBranches.map((branch) => (
						<SelectItem key={branch} value={branch} className="text-xs">
							{branch}
							{branch === branchData.defaultBranch && (
								<span className="ml-1 text-muted-foreground">(default)</span>
							)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
