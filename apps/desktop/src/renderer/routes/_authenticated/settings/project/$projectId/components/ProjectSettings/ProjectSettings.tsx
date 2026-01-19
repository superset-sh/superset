import { HiOutlineCog6Tooth, HiOutlineFolder } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ClickablePath } from "../../../../components/ClickablePath";
import { ScriptsEditor } from "./components/ScriptsEditor";

interface ProjectSettingsProps {
	projectId: string;
}

export function ProjectSettings({ projectId }: ProjectSettingsProps) {
	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});

	if (!project) {
		return null;
	}

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Project</h2>
			</div>

			<div className="space-y-6">
				<div className="space-y-2">
					<h3 className="text-base font-semibold text-foreground">Name</h3>
					<p>{project.name}</p>
				</div>

				<div className="space-y-2">
					<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
						<HiOutlineFolder className="h-4 w-4" />
						Repository Path
					</h3>
					<ClickablePath path={project.mainRepoPath} />
				</div>

				<div className="pt-4 border-t space-y-4">
					<div className="space-y-2">
						<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
							<HiOutlineCog6Tooth className="h-4 w-4" />
							Scripts
						</h3>
						<p className="text-sm text-muted-foreground">
							Configure setup and teardown scripts that run when workspaces are
							created or deleted.
						</p>
					</div>
					<ScriptsEditor projectId={project.id} projectName={project.name} />
				</div>
			</div>
		</div>
	);
}
