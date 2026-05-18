import type { CommandContext, SectionId } from "./types";

const BASE: SectionId[] = ["actions", "navigation"];

export const SECTION_LABELS: Record<SectionId, string> = {
	workspace: "Workspace actions",
	actions: "Actions",
	navigation: "Navigation",
};

export function resolveSectionOrder(context: CommandContext): SectionId[] {
	const isWorkspace = context.workspace !== null;
	return [...(isWorkspace ? (["workspace"] as SectionId[]) : []), ...BASE];
}
