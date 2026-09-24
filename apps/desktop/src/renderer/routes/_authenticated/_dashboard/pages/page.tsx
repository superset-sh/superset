import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PagesView } from "./components/PagesView";
import { isPageScope, type PageScope } from "./utils/pageScope";

export type PagesSearch = {
	q?: string;
	scope?: PageScope;
	author?: string;
	workspace?: string;
};

export const Route = createFileRoute("/_authenticated/_dashboard/pages/")({
	component: PagesPage,
	validateSearch: (search: Record<string, unknown>): PagesSearch => ({
		q: typeof search.q === "string" && search.q ? search.q : undefined,
		scope: isPageScope(search.scope) ? search.scope : undefined,
		author:
			typeof search.author === "string" && search.author
				? search.author
				: undefined,
		workspace:
			typeof search.workspace === "string" && search.workspace
				? search.workspace
				: undefined,
	}),
});

function PagesPage() {
	const { q, scope, author, workspace } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
		<PagesView
			search={q ?? ""}
			scope={scope ?? "all"}
			authorId={author ?? null}
			workspaceId={workspace ?? null}
			onSearchChange={(value) =>
				navigate({
					search: (prev) => ({ ...prev, q: value || undefined }),
					replace: true,
				})
			}
			onScopeChange={(value) =>
				navigate({
					search: (prev) => ({
						...prev,
						scope: value === "all" ? undefined : value,
					}),
					replace: true,
				})
			}
			onAuthorChange={(value) =>
				navigate({
					search: (prev) => ({ ...prev, author: value ?? undefined }),
					replace: true,
				})
			}
			onWorkspaceChange={(value) =>
				navigate({
					search: (prev) => ({ ...prev, workspace: value ?? undefined }),
					replace: true,
				})
			}
			onOpenPage={(page) =>
				navigate({ to: "/pages/$slug", params: { slug: page.slug } })
			}
		/>
	);
}
