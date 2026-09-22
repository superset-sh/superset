import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { PagesView } from "./components/PagesView";
import { isPageScope, type PageScope } from "./utils/filterPages";

export type PagesSearch = { q?: string; scope?: PageScope; author?: string };

export const Route = createFileRoute("/_authenticated/_dashboard/pages/")({
	component: PagesPage,
	validateSearch: (search: Record<string, unknown>): PagesSearch => ({
		q: typeof search.q === "string" && search.q ? search.q : undefined,
		scope: isPageScope(search.scope) ? search.scope : undefined,
		author:
			typeof search.author === "string" && search.author
				? search.author
				: undefined,
	}),
});

function PagesPage() {
	const { q, scope, author } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES);

	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;

	return (
		<PagesView
			search={q ?? ""}
			scope={scope ?? "all"}
			authorId={author ?? null}
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
		/>
	);
}
