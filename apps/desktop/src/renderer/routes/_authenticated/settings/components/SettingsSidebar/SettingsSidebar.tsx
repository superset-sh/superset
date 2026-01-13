import { Link } from "@tanstack/react-router";
import { HiArrowLeft } from "react-icons/hi2";
import { GeneralSettings } from "./components/GeneralSettings";
import { ProjectsSettings } from "./components/ProjectsSettings";

export function SettingsSidebar() {
	return (
		<div className="w-56 flex flex-col p-3 overflow-hidden">
			<Link
				to="/workspace"
				className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
			>
				<HiArrowLeft className="h-4 w-4" />
				<span>Back</span>
			</Link>

			<h1 className="text-lg font-semibold px-3 mb-4">Settings</h1>

			<div className="flex-1 overflow-y-auto min-h-0">
				<GeneralSettings />
				<ProjectsSettings />
			</div>
		</div>
	);
}
