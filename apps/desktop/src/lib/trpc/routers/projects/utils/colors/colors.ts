import { PROJECT_COLOR_VALUES } from "shared/constants/project-colors";

export function assignRandomColor(): string {
	return PROJECT_COLOR_VALUES[Math.floor(Math.random() * PROJECT_COLOR_VALUES.length)];
}
