import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { ProjectsSettingsSidebar } from "./components/ProjectsSettingsSidebar";

export const Route = createFileRoute("/_authenticated/settings/projects")({
	component: ProjectsSettingsLayout,
});

function ProjectsSettingsLayout() {
	const params = useParams({ strict: false }) as { projectId?: string };
	return (
		<div className="flex h-full w-full">
			<ProjectsSettingsSidebar selectedProjectId={params.projectId ?? null} />
			<div className="flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
