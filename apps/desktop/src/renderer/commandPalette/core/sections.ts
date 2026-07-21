import { env } from "renderer/env.renderer";
import type { CommandContext, SectionId } from "./types";

const BASE: SectionId[] = ["actions", "navigation", "add-project"];

export const SECTION_LABELS: Record<SectionId, string> = {
	workspace: "Workspace actions",
	actions: "Actions",
	navigation: "Navigation",
	"add-project": "Add project",
	dev: "Dev",
};

export function resolveSectionOrder(context: CommandContext): SectionId[] {
	const isWorkspace = context.workspace !== null;
	// "dev" is last and only ever populated in development (its commands are
	// gated at push time), so it stays hidden in production.
	const dev: SectionId[] =
		env.NODE_ENV === "development" ? (["dev"] as SectionId[]) : [];
	return [
		...(isWorkspace ? (["workspace"] as SectionId[]) : []),
		...BASE,
		...dev,
	];
}
