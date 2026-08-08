import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

/** Whether a folder has an explicit colour (not unset, not the default). */
export function hasCustomColor(color: string | null | undefined): boolean {
	return color != null && color !== PROJECT_COLOR_DEFAULT;
}
