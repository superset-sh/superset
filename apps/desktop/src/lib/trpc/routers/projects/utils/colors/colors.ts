import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

/**
 * Returns the default color for new projects.
 * Projects start with no custom color (gray border).
 */
export function getDefaultProjectColor(): string {
	return PROJECT_COLOR_DEFAULT;
}
