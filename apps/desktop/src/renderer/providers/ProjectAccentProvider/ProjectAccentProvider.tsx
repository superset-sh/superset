import {
	type CSSProperties,
	createContext,
	type ReactNode,
	useContext,
	useMemo,
} from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import {
	resolveProjectAccent,
	type TerminalTint,
} from "renderer/lib/project-accent";

const ProjectTerminalTintContext = createContext<TerminalTint | null>(null);

interface ProjectAccentProviderProps {
	projectId: string | null;
	children: ReactNode;
}

export function ProjectAccentProvider({
	projectId,
	children,
}: ProjectAccentProviderProps) {
	const { projects } = useHostProjects();
	const { preferences } = useV2UserPreferences();
	const color = projectId
		? (projects.find((project) => project.projectKey === projectId)?.color ??
			null)
		: null;
	const { enabled, tabBar, paneHeaders, background, sidebar, intensity } =
		preferences.projectAccent;
	const accent = useMemo(
		() =>
			resolveProjectAccent(color, {
				enabled,
				tabBar,
				paneHeaders,
				background,
				sidebar,
				intensity,
			}),
		[color, enabled, tabBar, paneHeaders, background, sidebar, intensity],
	);

	return (
		<ProjectTerminalTintContext.Provider value={accent?.terminalTint ?? null}>
			<div
				className="contents"
				style={accent?.cssVars as CSSProperties | undefined}
			>
				{children}
			</div>
		</ProjectTerminalTintContext.Provider>
	);
}

export function useProjectTerminalTint(): TerminalTint | null {
	return useContext(ProjectTerminalTintContext);
}
