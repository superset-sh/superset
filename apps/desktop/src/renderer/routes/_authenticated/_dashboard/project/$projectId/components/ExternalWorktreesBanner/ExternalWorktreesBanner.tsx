import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { motion } from "framer-motion";
import { GoGitBranch } from "react-icons/go";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useImportAllWorktrees } from "renderer/react-query/workspaces/useImportAllWorktrees";

const MAX_VISIBLE_BRANCHES = 5;

export function ExternalWorktreesBanner({ projectId }: { projectId: string }) {
	const { t } = useLingui();
	const { data: externalWorktrees = [], isLoading } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery({ projectId });
	const importableWorktrees = externalWorktrees.filter(
		(worktree) => !worktree.hasActiveWorkspace,
	);

	const importAllWorktrees = useImportAllWorktrees();

	if (isLoading || importableWorktrees.length === 0) {
		return null;
	}

	const handleImportAll = async () => {
		try {
			const result = await importAllWorktrees.mutateAsync({ projectId });
			toast.success(
				t({
					message: plural(result.imported, {
						one: "Imported # workspace",
						other: "Imported # workspaces",
					}),
				}),
			);
		} catch (err) {
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to import worktrees",
					}),
				),
			);
		}
	};

	const visibleBranches = importableWorktrees.slice(0, MAX_VISIBLE_BRANCHES);
	const remainingCount = importableWorktrees.length - visibleBranches.length;

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 8 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
			className="mx-6 mt-6 rounded-lg border border-border/60 bg-card/50 p-4"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-2 min-w-0">
					<p className="text-sm font-medium text-foreground">
						<Plural
							value={importableWorktrees.length}
							one="# existing worktree found"
							other="# existing worktrees found"
						/>
					</p>
					<div className="flex flex-wrap gap-1.5">
						{visibleBranches.map((wt) => (
							<span
								key={wt.path}
								className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground"
							>
								<GoGitBranch className="size-3 shrink-0" />
								<span className="truncate max-w-[180px]">{wt.branch}</span>
							</span>
						))}
						{remainingCount > 0 && (
							<span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
								<Trans>+{remainingCount} more</Trans>
							</span>
						)}
					</div>
				</div>

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							size="sm"
							variant="outline"
							className="shrink-0"
							disabled={importAllWorktrees.isPending}
						>
							{importAllWorktrees.isPending ? (
								<Trans>Importing...</Trans>
							) : (
								<Trans>Import all</Trans>
							)}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								<Trans>Import all worktrees</Trans>
							</AlertDialogTitle>
							<AlertDialogDescription>
								<Plural
									value={importableWorktrees.length}
									one="This will import # existing worktree into Superset as workspaces. Each worktree on disk will be tracked and appear in your sidebar. No files will be modified."
									other="This will import # existing worktrees into Superset as workspaces. Each worktree on disk will be tracked and appear in your sidebar. No files will be modified."
								/>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>
								<Trans>Cancel</Trans>
							</AlertDialogCancel>
							<AlertDialogAction onClick={handleImportAll}>
								<Trans>Import all</Trans>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</motion.div>
	);
}
