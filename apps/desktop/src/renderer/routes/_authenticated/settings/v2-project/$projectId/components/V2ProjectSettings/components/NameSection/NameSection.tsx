import { Input } from "@superset/ui/input";
import { useEffect, useState } from "react";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";

interface NameSectionProps {
	projectId: string;
	currentName: string;
}

export function NameSection({ projectId, currentName }: NameSectionProps) {
	const { v2Projects: projectActions } = useOptimisticCollectionActions();
	const [value, setValue] = useState(currentName);

	useEffect(() => {
		setValue(currentName);
	}, [currentName]);

	const commit = () => {
		const trimmed = value.trim();
		if (!trimmed) {
			setValue(currentName);
			return;
		}
		if (trimmed === currentName) return;
		projectActions.renameProject(projectId, trimmed);
	};

	return (
		<Input
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					(e.target as HTMLInputElement).blur();
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setValue(currentName);
					(e.target as HTMLInputElement).blur();
				}
			}}
			placeholder="Project name"
		/>
	);
}
