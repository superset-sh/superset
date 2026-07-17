import { Input } from "@superset/ui/input";
import { useEffect, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface NameSectionProps {
	projectId: string;
	currentName: string;
	/** Host serving this project, when there is one. */
	hostUrl: string | null;
	/** False when no reachable host serves the project — rename disabled. */
	canRename: boolean;
}

export function NameSection({
	projectId,
	currentName,
	hostUrl,
	canRename,
}: NameSectionProps) {
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
		if (!hostUrl) return;
		// Renames commit on the host — host.db owns the project name; the
		// project:changed event updates every open surface.
		void getHostServiceClientByUrl(hostUrl)
			.project.update.mutate({ projectId, name: trimmed })
			.catch((err) => {
				console.warn("[project-rename] host commit failed", err);
				setValue(currentName);
			});
	};

	return (
		<Input
			id="project-name"
			value={value}
			disabled={!canRename}
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
			className="w-96"
		/>
	);
}
