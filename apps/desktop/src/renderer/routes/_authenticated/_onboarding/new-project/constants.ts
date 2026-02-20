export type NewProjectMode = "empty" | "clone" | "template";

export interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	url: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [];
