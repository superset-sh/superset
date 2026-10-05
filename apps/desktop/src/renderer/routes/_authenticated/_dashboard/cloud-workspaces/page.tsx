import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { CloudWorkspacesView } from "./components/CloudWorkspacesView";
import type {
	CloudWorkspaceStatusFilter,
	CloudWorkspacesSearch,
} from "./types";

const stringList = (value: unknown) => {
	const list = (Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === "string" && item.length > 0,
	);
	return list.length > 0 ? list : undefined;
};

const STATUS_FILTERS: CloudWorkspaceStatusFilter[] = ["active", "archived"];

export const Route = createFileRoute(
	"/_authenticated/_dashboard/cloud-workspaces/",
)({
	component: CloudWorkspacesPage,
	validateSearch: (search: Record<string, unknown>): CloudWorkspacesSearch => ({
		people: stringList(search.people),
		projects: stringList(search.projects),
		labels: stringList(search.labels),
		status: (() => {
			const status = STATUS_FILTERS.filter((filter) =>
				stringList(search.status)?.includes(filter),
			);
			return status.length > 0 && status.join() !== "active"
				? status
				: undefined;
		})(),
	}),
});

function CloudWorkspacesPage() {
	const search = Route.useSearch();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return <CloudWorkspacesView search={search} />;
}
