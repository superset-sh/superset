import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspaces/",
)({
	component: V2WorkspacesPage,
});

function V2WorkspacesPage() {
	return (
		<div className="flex h-full flex-col overflow-y-auto p-6">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
					<p className="max-w-2xl text-sm text-muted-foreground">
						This page will become the browse surface for all accessible V2
						workspaces, with sidebar workspaces prioritized first.
					</p>
				</div>

				<div className="rounded-xl border border-border bg-card p-5">
					<h2 className="text-sm font-medium">WIP</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						Next up is splitting local sidebar workspaces from the full set of
						accessible shared workspaces and giving this page proper search,
						filtering, and recents.
					</p>
				</div>
			</div>
		</div>
	);
}
