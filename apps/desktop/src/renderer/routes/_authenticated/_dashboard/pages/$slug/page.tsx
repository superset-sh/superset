import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { PageDetailView } from "./components/PageDetailView";

export const Route = createFileRoute("/_authenticated/_dashboard/pages/$slug/")(
	{
		component: PageDetailPage,
		validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
			thread: typeof search.thread === "string" ? search.thread : undefined,
		}),
	},
);

function PageDetailPage() {
	const { slug } = Route.useParams();
	const { thread } = Route.useSearch();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES);

	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;

	return <PageDetailView key={slug} slug={slug} initialThreadId={thread} />;
}
