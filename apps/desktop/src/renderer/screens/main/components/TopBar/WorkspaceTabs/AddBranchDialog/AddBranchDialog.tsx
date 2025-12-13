import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useCreateBranchWorkspace } from "renderer/react-query/workspaces";

interface AddBranchDialogProps {
	projectId: string;
	projectName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AddBranchDialog({
	projectId,
	projectName,
	open,
	onOpenChange,
}: AddBranchDialogProps) {
	const [search, setSearch] = useState("");
	const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

	const { data: branches, isLoading } = trpc.workspaces.getBranches.useQuery(
		{ projectId },
		{ enabled: open },
	);

	const createBranchWorkspace = useCreateBranchWorkspace();

	// Combine local and remote branches, deduplicate
	const allBranches = branches
		? Array.from(new Set([...branches.local, ...branches.remote]))
		: [];

	// Filter branches by search
	const filteredBranches = allBranches.filter((branch) =>
		branch.toLowerCase().includes(search.toLowerCase()),
	);

	const handleCreate = async () => {
		if (!selectedBranch) return;

		toast.promise(
			createBranchWorkspace.mutateAsync({
				projectId,
				branch: selectedBranch,
			}),
			{
				loading: `Creating workspace for ${selectedBranch}...`,
				success: () => {
					onOpenChange(false);
					setSelectedBranch(null);
					setSearch("");
					return `Workspace created for ${selectedBranch}`;
				},
				error: (err) =>
					err instanceof Error ? err.message : "Failed to create workspace",
			},
		);
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			setSelectedBranch(null);
			setSearch("");
		}
		onOpenChange(newOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent
				className="sm:max-w-[425px]"
				onPointerDownOutside={(e) => e.preventDefault()}
				onInteractOutside={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Add Existing Branch</DialogTitle>
					<DialogDescription>
						Select a branch from {projectName} to create a workspace
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="relative">
						<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search branches..."
							className="w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:bg-background"
						/>
					</div>

					<div className="max-h-[300px] overflow-y-auto rounded-md border border-border">
						{isLoading ? (
							<div className="p-4 text-center text-sm text-muted-foreground">
								Loading branches...
							</div>
						) : filteredBranches.length === 0 ? (
							<div className="p-4 text-center text-sm text-muted-foreground">
								{search ? "No matching branches" : "No branches found"}
							</div>
						) : (
							<div className="divide-y divide-border">
								{filteredBranches.map((branch) => (
									<button
										key={branch}
										type="button"
										onClick={() => setSelectedBranch(branch)}
										className={`w-full px-3 py-2 text-left text-sm transition-colors ${
											selectedBranch === branch
												? "bg-accent text-accent-foreground"
												: "hover:bg-accent/50"
										}`}
									>
										{branch}
									</button>
								))}
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => handleOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={handleCreate}
						disabled={!selectedBranch || createBranchWorkspace.isPending}
					>
						Create Workspace
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
