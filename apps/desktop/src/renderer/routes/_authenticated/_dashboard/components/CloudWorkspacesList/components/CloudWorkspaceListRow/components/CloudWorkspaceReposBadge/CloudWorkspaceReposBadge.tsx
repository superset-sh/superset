import { Trans } from "@lingui/react/macro";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { CloudRepositoryRow } from "renderer/routes/_authenticated/_dashboard/components/CloudRepositoryRow";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import { CloudWorkspaceRowChip } from "../CloudWorkspaceRowChip";

interface CloudWorkspaceReposBadgeProps {
	repos: string[];
	onOpenRepo: (fullName: string) => void;
}

export function CloudWorkspaceReposBadge({
	repos,
	onOpenRepo,
}: CloudWorkspaceReposBadgeProps) {
	const [first] = repos;
	if (!first) return null;
	const [owner, name] = first.split("/");
	return (
		<HoverCard openDelay={150} closeDelay={100}>
			<HoverCardTrigger asChild>
				<CloudWorkspaceRowChip
					onClick={(event) => {
						event.stopPropagation();
						if (repos.length === 1) onOpenRepo(first);
					}}
				>
					{owner && (
						<img
							src={
								resolveProjectIconUrl({ icon: null, repoOwner: owner }) ??
								undefined
							}
							alt=""
							className="size-3 rounded-[3px]"
						/>
					)}
					{name ?? first}
					{repos.length > 1 && (
						<span className="text-muted-foreground/70">
							+{repos.length - 1}
						</span>
					)}
				</CloudWorkspaceRowChip>
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-72 p-1 pt-2"
				onClick={(event) => event.stopPropagation()}
			>
				<CloudSection title={<Trans>Repositories</Trans>}>
					{repos.map((fullName) => (
						<CloudRepositoryRow
							key={fullName}
							fullName={fullName}
							onOpen={() => onOpenRepo(fullName)}
						/>
					))}
				</CloudSection>
			</HoverCardContent>
		</HoverCard>
	);
}
