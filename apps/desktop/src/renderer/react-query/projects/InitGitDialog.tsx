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
import { useGitInitDialogStore } from "renderer/stores/git-init-dialog";

export function InitGitDialog() {
	const {
		isOpen,
		pendingAction,
		folders,
		onConfirm,
		onOpenEnclosing,
		onCancel,
	} = useGitInitDialogStore();

	const isPending = pendingAction !== null;
	const isSingle = folders.length === 1;
	// Only offer "open the enclosing repo" when it accounts for every selected
	// folder. In a mixed selection the plain folders have no enclosing repo, so
	// opening only the nested ones would silently drop the rest.
	const enclosingRoots =
		folders.length > 0 && folders.every((folder) => folder.enclosingRepoPath)
			? [
					...new Set(
						folders
							.map((folder) => folder.enclosingRepoPath)
							.filter((root): root is string => !!root),
					),
				]
			: [];
	const canOpenEnclosing = enclosingRoots.length > 0;
	const firstRoot = enclosingRoots[0];

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open && !isPending) onCancel?.();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{canOpenEnclosing
							? "Open the enclosing repository?"
							: "Initialize Git Repository?"}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-2">
							{isSingle && folders[0] ? (
								folders[0].enclosingRepoPath ? (
									<p>
										<span className="font-medium text-foreground">
											{getBaseName(folders[0].path)}
										</span>{" "}
										isn't a git repository. It's inside{" "}
										<span className="font-medium text-foreground">
											{getBaseName(folders[0].enclosingRepoPath)}
										</span>{" "}
										({folders[0].enclosingRepoPath}).
									</p>
								) : (
									<p>
										<span className="font-medium text-foreground">
											{getBaseName(folders[0].path)}
										</span>{" "}
										is not a git repository. Would you like to initialize one?
									</p>
								)
							) : (
								<>
									<p>
										The following folders are not git repositories. Would you
										like to initialize them?
									</p>
									<ul className="list-disc pl-4 space-y-1">
										{folders.map((folder) => (
											<li key={folder.path}>
												<span className="font-medium text-foreground">
													{getBaseName(folder.path)}
												</span>
												<span className="text-xs ml-1 text-muted-foreground">
													{folder.path}
												</span>
												{folder.enclosingRepoPath ? (
													<span className="text-xs ml-1 text-muted-foreground">
														inside {getBaseName(folder.enclosingRepoPath)}
													</span>
												) : null}
											</li>
										))}
									</ul>
								</>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button
						variant="outline"
						disabled={isPending}
						onClick={() => onCancel?.()}
					>
						Cancel
					</Button>
					<Button
						variant={canOpenEnclosing ? "outline" : "default"}
						disabled={isPending}
						onClick={() => onConfirm?.()}
					>
						{pendingAction === "init" ? "Initializing..." : "Initialize Git"}
					</Button>
					{canOpenEnclosing ? (
						<Button disabled={isPending} onClick={() => onOpenEnclosing?.()}>
							{pendingAction === "openEnclosing"
								? "Opening..."
								: enclosingRoots.length === 1 && firstRoot
									? `Open ${getBaseName(firstRoot)}`
									: "Open enclosing repositories"}
						</Button>
					) : null}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
