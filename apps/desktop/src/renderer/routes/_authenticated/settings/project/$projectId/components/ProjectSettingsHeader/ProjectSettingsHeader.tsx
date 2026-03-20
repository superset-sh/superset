import type { ReactNode } from "react";

interface ProjectSettingsHeaderProps {
	title: string;
	children?: ReactNode;
}

export function ProjectSettingsHeader({
	title,
	children,
}: ProjectSettingsHeaderProps) {
	return (
		<div className="mb-8">
			<h2 className="text-xl font-semibold">{title}</h2>
			{children && <div className="mt-1">{children}</div>}
		</div>
	);
}
