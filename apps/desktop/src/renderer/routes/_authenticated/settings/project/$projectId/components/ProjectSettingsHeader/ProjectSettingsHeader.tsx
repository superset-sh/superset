import type { ReactNode } from "react";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

interface ProjectSettingsHeaderProps {
	title: string;
	children?: ReactNode;
}

export function ProjectSettingsHeader({
	title,
	children,
}: ProjectSettingsHeaderProps) {
	const searchQuery = useSettingsSearchQuery();
	return (
		<div className="mb-8">
			<h2 className="text-xl font-semibold">
				<HighlightText text={title} query={searchQuery} />
			</h2>
			{children && <div className="mt-1">{children}</div>}
		</div>
	);
}
