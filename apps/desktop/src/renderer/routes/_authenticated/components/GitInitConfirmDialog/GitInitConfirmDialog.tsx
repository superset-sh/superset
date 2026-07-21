import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { getBaseName } from "renderer/lib/pathBasename";
import { useGitInitConfirmStore } from "renderer/stores/git-init-confirm";

/**
 * Confirms initializing git in a folder the user picked to import that isn't a
 * git repo yet. Driven imperatively by `useGitInitConfirmStore.request()` from
 * the folder-first import flow; mounted once via AddRepositoryModals.
 */
export function GitInitConfirmDialog() {
	const isOpen = useGitInitConfirmStore((s) => s.isOpen);
	const repoPath = useGitInitConfirmStore((s) => s.repoPath);
	const resolve = useGitInitConfirmStore((s) => s.resolve);

	const folderName = repoPath ? getBaseName(repoPath) : "this folder";

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) resolve(false);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Initialize git repository?</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<p>
							<span className="font-medium text-foreground select-text cursor-text">
								{folderName}
							</span>{" "}
							isn't a git repository yet. Initialize git here and import it?
						</p>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button variant="outline" onClick={() => resolve(false)}>
						Cancel
					</Button>
					<Button onClick={() => resolve(true)}>Initialize &amp; import</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
