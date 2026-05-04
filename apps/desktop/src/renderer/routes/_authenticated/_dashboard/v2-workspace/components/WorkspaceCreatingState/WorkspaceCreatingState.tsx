import { Loader2 } from "lucide-react";

interface WorkspaceCreatingStateProps {
	name?: string;
	branch?: string;
}

export function WorkspaceCreatingState({
	name,
	branch,
}: WorkspaceCreatingStateProps) {
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-card px-6 py-8 text-center">
				<div className="mb-4 rounded-full border border-border bg-muted/40 p-3 text-muted-foreground">
					<Loader2 className="size-5 animate-spin" />
				</div>
				<h1 className="text-lg font-semibold tracking-tight">
					Creating workspace
				</h1>
				{name && <p className="mt-2 text-sm text-muted-foreground">{name}</p>}
				{branch && (
					<p className="mt-1 text-xs text-muted-foreground/80">
						Branch: {branch}
					</p>
				)}
			</div>
		</div>
	);
}
