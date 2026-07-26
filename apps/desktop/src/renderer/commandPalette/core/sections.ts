import type { CommandContext, SectionId } from "./types";

const BASE: SectionId[] = ["actions", "navigation", "add-project"];

export const SECTION_LABELS: Record<SectionId, string> = {
	workspace: "Workspace actions",
	actions: "Actions",
	navigation: "Navigation",
	"add-project": "Add project",
};

export function resolveSectionOrder(context: CommandContext): SectionId[] {
	const isWorkspace = context.workspace !== null;
	return [...(isWorkspace ? (["workspace"] as SectionId[]) : []), ...BASE];
}
