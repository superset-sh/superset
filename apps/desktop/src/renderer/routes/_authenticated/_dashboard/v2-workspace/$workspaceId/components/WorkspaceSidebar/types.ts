import type { ReactNode } from "react";

export interface SidebarTabDefinition {
	id: string;
	label: string;
	badge?: number;
	actions?: ReactNode;
	content: ReactNode;
}
