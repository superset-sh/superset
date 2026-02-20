import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useGitInitDialogStore } from "renderer/stores/git-init-dialog";

export function InitGitDialog() {
	const { isOpen, isPending, paths, onConfirm, onCancel } =
		useGitInitDialogStore();

	const isSingle = paths.length === 1;

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open && !isPending) onCancel?.();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Initialize Git Repository?</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-2">
							{isSingle ? (
								<p>
									<span className="font-medium text-foreground">
										{paths[0]?.split("/").pop()}
									</span>{" "}
									is not a git repository. Would you like to initialize one?
								</p>
							) : (
								<>
									<p>
										The following folders are not git repositories. Would you
										like to initialize them?
									</p>
									<ul className="list-disc pl-4 space-y-1">
										{paths.map((p) => (
											<li key={p}>
												<span className="font-medium text-foreground">
													{p.split("/").pop()}
												</span>
												<span className="text-xs ml-1 text-muted-foreground">
													{p}
												</span>
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
					<Button disabled={isPending} onClick={() => onConfirm?.()}>
						{isPending ? "Initializing..." : "Initialize Git"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
