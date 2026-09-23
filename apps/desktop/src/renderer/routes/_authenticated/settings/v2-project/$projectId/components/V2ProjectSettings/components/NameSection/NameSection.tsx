import { useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HOST_PROJECT_GROUPS_QUERY_PREFIX } from "renderer/hooks/host-projects/useHostProjectGroups";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface NameSectionProps {
	projectId: string;
	groupId: string | null;
	currentName: string;
	/** Host serving this project, when there is one. */
	hostUrl: string | null;
	/** False when no reachable host serves the project — rename disabled. */
	canRename: boolean;
	/** Called after the host commit so the caller can refresh its host row. */
	onRenamed?: () => void;
}

export function NameSection({
	projectId,
	groupId,
	currentName,
	hostUrl,
	canRename,
	onRenamed,
}: NameSectionProps) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
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
		const host = getHostServiceClientByUrl(hostUrl);
		void (
			groupId
				? host.projectGroups.rename
						.mutate({ groupId, name: trimmed })
						.then(() =>
							queryClient.invalidateQueries({
								queryKey: HOST_PROJECT_GROUPS_QUERY_PREFIX,
							}),
						)
				: host.project.update.mutate({ projectId, name: trimmed })
		)
			.then(() => onRenamed?.())
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
			placeholder={t({
				message: "Project name",
			})}
			className="w-96"
		/>
	);
}
