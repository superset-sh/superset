import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useScrollReset } from "../hooks/useScrollReset";
import { ProjectsSettingsSidebar } from "./components/ProjectsSettingsSidebar";

export const Route = createFileRoute("/_authenticated/settings/projects")({
	component: ProjectsSettingsLayout,
});

function ProjectsSettingsLayout() {
	const params = useParams({ strict: false }) as { projectId?: string };
	const contentRef = useScrollReset<HTMLDivElement>(params.projectId);
	return (
		<div className="flex h-full w-full">
			<ProjectsSettingsSidebar selectedProjectId={params.projectId ?? null} />
			<div ref={contentRef} className="flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
