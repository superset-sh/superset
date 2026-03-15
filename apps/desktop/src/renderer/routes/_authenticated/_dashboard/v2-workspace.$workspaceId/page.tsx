import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
});

function V2WorkspacePage() {
	const isV2CloudEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD) ?? false;
	const { workspaceId } = Route.useParams();
	const collections = useCollections();

	const { data: workspaces = [] } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);

	const { data: projects = [] } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const { data: devices = [] } = useLiveQuery(
		(q) => q.from({ v2Devices: collections.v2Devices }),
		[collections],
	);

	const workspace = useMemo(
		() => workspaces.find((w) => w.id === workspaceId),
		[workspaces, workspaceId],
	);

	const project = useMemo(
		() => projects.find((p) => p.id === workspace?.projectId),
		[projects, workspace?.projectId],
	);

	const device = useMemo(
		() => devices.find((d) => d.id === workspace?.deviceId),
		[devices, workspace?.deviceId],
	);

	if (!isV2CloudEnabled) {
		return <Navigate to="/workspace" replace />;
	}

	if (!workspace) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				<div className="text-center">
					<p className="text-lg font-medium">Workspace not found</p>
					<p className="mt-1 text-sm">
						The workspace "{workspaceId}" could not be found.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full items-center justify-center p-8">
			<div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
				<h2 className="text-lg font-semibold">{workspace.name}</h2>
				<div className="mt-4 space-y-3 text-sm">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Branch</span>
						<span className="font-mono text-xs">{workspace.branch}</span>
					</div>
					{project && (
						<div className="flex justify-between">
							<span className="text-muted-foreground">Project</span>
							<span>{project.name}</span>
						</div>
					)}
					{device && (
						<div className="flex justify-between">
							<span className="text-muted-foreground">Device</span>
							<span>{device.name}</span>
						</div>
					)}
					<div className="flex justify-between">
						<span className="text-muted-foreground">ID</span>
						<span className="font-mono text-xs">{workspace.id}</span>
					</div>
				</div>
			</div>
		</div>
	);
}
