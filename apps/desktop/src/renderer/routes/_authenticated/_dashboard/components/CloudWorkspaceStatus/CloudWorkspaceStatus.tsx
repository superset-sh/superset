import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { LuArchive, LuInfo } from "react-icons/lu";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";

interface CloudWorkspaceStatusProps {
	workspace: Pick<
		CloudWorkspaceRow,
		"status" | "agentStatus" | "agentStatusAt"
	>;
	isRead: boolean;
	now?: Date;
}

export function CloudWorkspaceStatus({
	workspace,
	isRead,
	now,
}: CloudWorkspaceStatusProps) {
	const { t } = useLingui();
	const { formatAge } = useFormat();

	if (workspace.status === "provisioning") {
		return (
			<span
				role="img"
				aria-label={t({ message: "Creating the sandbox" })}
				className="flex text-muted-foreground"
			>
				<WaveSpinner />
			</span>
		);
	}
	if (workspace.status === "deleted") {
		return (
			<LuArchive
				role="img"
				aria-label={t({ message: "Archived" })}
				className="size-3.5 text-muted-foreground"
			/>
		);
	}
	if (workspace.status === "failed") {
		return (
			<LuInfo
				role="img"
				aria-label={t({ message: "Sandbox stopped responding" })}
				className="size-3.5 text-red-400"
			/>
		);
	}
	switch (workspace.agentStatus) {
		case "permission":
			return (
				<span
					role="img"
					aria-label={t({ message: "Waiting for your input" })}
					className="relative flex size-1.5"
				>
					<span className="absolute inset-0 animate-ping rounded-full bg-yellow-400 opacity-75" />
					<span className="relative size-1.5 rounded-full bg-yellow-500" />
				</span>
			);
		case "failed":
			return (
				<LuInfo
					role="img"
					aria-label={t({ message: "Agent run failed" })}
					className="size-3.5 text-red-400"
				/>
			);
		case "working":
			return (
				<span
					role="img"
					aria-label={t({ message: "Agent is working" })}
					className="flex text-amber-500"
				>
					<WaveSpinner />
				</span>
			);
		case "review":
			if (!isRead) {
				return (
					<span
						role="img"
						aria-label={t({ message: "Agent finished" })}
						className="size-1.5 rounded-full bg-success"
					/>
				);
			}
	}
	if (!workspace.agentStatusAt) return null;
	return (
		<span className="text-[11px] tabular-nums text-muted-foreground">
			{formatAge(workspace.agentStatusAt, now)}
		</span>
	);
}
