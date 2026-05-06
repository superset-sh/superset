import type { ComponentType, ReactNode } from "react";

export interface SidebarTabDefinition {
	id: string;
	label: string;
	icon?: ComponentType<{ className?: string }>;
	badge?: number;
	actions?: ReactNode;
	content: ReactNode;
}
