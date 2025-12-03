import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import {
	HiArrowLeft,
	HiChevronDown,
	HiChevronRight,
	HiOutlineCommandLine,
	HiOutlinePaintBrush,
} from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces";
import { type SettingsSection, useCloseSettings } from "renderer/stores";

interface SettingsSidebarProps {
	activeSection: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
}

const GENERAL_SECTIONS: {
	id: SettingsSection;
	label: string;
	icon: React.ReactNode;
}[] = [
	{
		id: "appearance",
		label: "Appearance",
		icon: <HiOutlinePaintBrush className="h-4 w-4" />,
	},
	{
		id: "keyboard",
		label: "Keyboard Shortcuts",
		icon: <HiOutlineCommandLine className="h-4 w-4" />,
	},
];

export function SettingsSidebar({
	activeSection,
	onSectionChange,
}: SettingsSidebarProps) {
	const closeSettings = useCloseSettings();
	const { data: groups = [] } = trpc.workspaces.getAllGrouped.useQuery();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const setActiveWorkspace = useSetActiveWorkspace();
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
		new Set(),
	);

	// Expand all projects by default when groups are loaded
	useEffect(() => {
		if (groups.length > 0) {
			setExpandedProjects(new Set(groups.map((g) => g.project.id)));
		}
	}, [groups]);

	const toggleProject = (projectId: string) => {
		setExpandedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	};

	const handleProjectClick = (workspaceId: string) => {
		// Set a workspace from this project as active to show project settings
		setActiveWorkspace.mutate({ id: workspaceId });
		onSectionChange("project");
	};

	const handleWorkspaceClick = (workspaceId: string) => {
		setActiveWorkspace.mutate({ id: workspaceId });
		onSectionChange("workspace");
	};

	return (
		<div className="w-56 flex flex-col p-3 overflow-hidden">
			{/* Back button */}
			<button
				type="button"
				onClick={closeSettings}
				className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
			>
				<HiArrowLeft className="h-4 w-4" />
				<span>Back</span>
			</button>

			{/* Settings title */}
			<h1 className="text-lg font-semibold px-3 mb-4">Settings</h1>

			<div className="flex-1 overflow-y-auto min-h-0">
				{/* General Settings */}
				<div className="mb-4">
					<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
						General
					</h2>
					<nav className="flex flex-col gap-0.5">
						{GENERAL_SECTIONS.map((section) => (
							<button
								key={section.id}
								type="button"
								onClick={() => onSectionChange(section.id)}
								className={cn(
									"flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
									activeSection === section.id
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
								)}
							>
								{section.icon}
								{section.label}
							</button>
						))}
					</nav>
				</div>

				{/* Projects */}
				{groups.length > 0 && (
					<div className="mb-4">
						<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
							Projects
						</h2>
						<nav className="flex flex-col gap-0.5">
							{groups.map((group) => (
								<div key={group.project.id}>
									{/* Project header */}
									<div className="flex items-center">
										<button
											type="button"
											onClick={() =>
												handleProjectClick(group.workspaces[0]?.id ?? "")
											}
											className={cn(
												"flex-1 flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm text-left rounded-l-md transition-colors",
												activeWorkspace?.projectId === group.project.id &&
													activeSection === "project"
													? "bg-accent text-accent-foreground"
													: "hover:bg-accent/50",
											)}
										>
											<div
												className="w-2 h-2 rounded-full shrink-0"
												style={{ backgroundColor: group.project.color }}
											/>
											<span className="flex-1 truncate font-medium">
												{group.project.name}
											</span>
										</button>
										<button
											type="button"
											onClick={() => toggleProject(group.project.id)}
											className={cn(
												"px-2 py-1.5 rounded-r-md transition-colors",
												activeWorkspace?.projectId === group.project.id &&
													activeSection === "project"
													? "bg-accent text-accent-foreground"
													: "hover:bg-accent/50 text-muted-foreground",
											)}
										>
											{expandedProjects.has(group.project.id) ? (
												<HiChevronDown className="h-3.5 w-3.5" />
											) : (
												<HiChevronRight className="h-3.5 w-3.5" />
											)}
										</button>
									</div>

									{/* Workspaces */}
									{expandedProjects.has(group.project.id) && (
										<div className="ml-4 border-l border-border pl-2 mt-0.5 mb-1">
											{group.workspaces.map((workspace) => (
												<button
													key={workspace.id}
													type="button"
													onClick={() => handleWorkspaceClick(workspace.id)}
													className={cn(
														"flex items-center gap-2 px-2 py-1 text-sm w-full text-left rounded-md transition-colors",
														activeWorkspace?.id === workspace.id &&
															activeSection === "workspace"
															? "bg-accent text-accent-foreground"
															: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
													)}
												>
													<span className="truncate">{workspace.name}</span>
												</button>
											))}
										</div>
									)}
								</div>
							))}
						</nav>
					</div>
				)}
			</div>
		</div>
	);
}
