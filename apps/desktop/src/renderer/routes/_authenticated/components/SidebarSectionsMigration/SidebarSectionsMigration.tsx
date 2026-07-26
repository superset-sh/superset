import { useMigrateSidebarSectionsToHost } from "renderer/routes/_authenticated/hooks/useMigrateSidebarSectionsToHost";

/** Mount-only runner for the legacy sidebar-sections → host migration. */
export function SidebarSectionsMigration() {
	useMigrateSidebarSectionsToHost();
	return null;
}
