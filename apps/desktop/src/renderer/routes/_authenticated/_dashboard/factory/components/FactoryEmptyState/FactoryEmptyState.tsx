import { Button } from "@superset/ui/button";
import { LuFactory, LuLoaderCircle } from "react-icons/lu";

interface FactoryEmptyStateProps {
	hostReady: boolean;
	pending: boolean;
	error: Error | null;
	onCreate: () => void;
	onExploreSample: () => void;
}

export function FactoryEmptyState({
	hostReady,
	pending,
	error,
	onCreate,
	onExploreSample,
}: FactoryEmptyStateProps) {
	return (
		<div className="flex h-full w-full items-center justify-center p-8">
			<div className="max-w-md text-center">
				<div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-border bg-muted/60 text-primary">
					<LuFactory className="size-5" />
				</div>
				<h1 className="mt-5 text-lg font-semibold text-foreground">
					Create your first Factory
				</h1>
				<p className="mt-2 select-text cursor-text text-sm leading-relaxed text-muted-foreground">
					Bring issues, plans, worktrees, agents, checks, and pull requests into
					one human-controlled delivery flow.
				</p>
				{error && (
					<p className="mt-4 select-text cursor-text rounded-md border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-left text-xs text-red-700 dark:text-red-300">
						{error.message}
					</p>
				)}
				<div className="mt-5 flex items-center justify-center gap-2">
					<Button
						disabled={!hostReady || pending || error !== null}
						onClick={onCreate}
					>
						{pending && <LuLoaderCircle className="size-4 animate-spin" />}
						{error
							? "Factory service unavailable"
							: hostReady
								? "Create Superset Factory"
								: "Starting host service…"}
					</Button>
					<Button variant="outline" onClick={onExploreSample}>
						Explore sample
					</Button>
				</div>
				<p className="mt-3 text-xs text-muted-foreground">
					Sample data stays in this view. Real Factory state is stored locally
					per organization.
				</p>
			</div>
		</div>
	);
}
