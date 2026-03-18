import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HiArrowLeft } from "react-icons/hi2";

interface ProjectSettingsHeaderProps {
	title: string;
	children?: ReactNode;
}

export function ProjectSettingsHeader({
	title,
	children,
}: ProjectSettingsHeaderProps) {
	return (
		<div className="mb-8 space-y-4">
			<Button variant="ghost" size="sm" asChild>
				<Link to="/settings/projects">
					<HiArrowLeft className="h-4 w-4" />
					Projects
				</Link>
			</Button>

			<div>
				<h2 className="text-xl font-semibold">{title}</h2>
				{children && <div className="mt-1">{children}</div>}
			</div>
		</div>
	);
}
