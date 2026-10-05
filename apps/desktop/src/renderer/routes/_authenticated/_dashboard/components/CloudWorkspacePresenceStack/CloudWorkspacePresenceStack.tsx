import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { CloudWorkspacePresenceOverflow } from "./components/CloudWorkspacePresenceOverflow";
import { isViewerAlone } from "./utils/isViewerAlone";

interface CloudWorkspacePresenceStackProps {
	people: CloudWorkspaceRow["presence"];
	viewerId: string | undefined;
	now: Date;
	activeWithinMs: number;
	onOpenPerson: (userId: string) => void;
}

export function CloudWorkspacePresenceStack({
	people,
	viewerId,
	now,
	activeWithinMs,
	onOpenPerson,
}: CloudWorkspacePresenceStackProps) {
	const { t } = useLingui();
	const { formatCompactRelativeTime } = useFormat();
	if (isViewerAlone(people, viewerId)) return null;
	const byId = new Map(people.map((person) => [person.userId, person]));
	const isActive = (lastSeenAt: Date) =>
		now.getTime() - lastSeenAt.getTime() < activeWithinMs;

	return (
		<AvatarStack
			people={people.map((person) => ({
				id: person.userId,
				name: person.name,
				image: person.image,
				isActive: isActive(person.lastSeenAt),
			}))}
			size={20}
			className="px-1"
			renderOverflow={(hidden, count) => (
				<CloudWorkspacePresenceOverflow
					people={hidden.flatMap((stacked) => byId.get(stacked.id) ?? [])}
					label={String(count)}
					now={now}
					isActive={isActive}
					onOpenPerson={onOpenPerson}
				/>
			)}
			renderPerson={(stacked, avatar) => {
				const person = byId.get(stacked.id);
				if (!person) return avatar;
				const active = isActive(person.lastSeenAt);
				const lastSeen = formatCompactRelativeTime(person.lastSeenAt, now);
				return (
					<HoverCard openDelay={200} closeDelay={100}>
						<HoverCardTrigger asChild>
							<button
								type="button"
								onClick={() => onOpenPerson(person.userId)}
								aria-label={person.name}
								className="block size-full cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{avatar}
							</button>
						</HoverCardTrigger>
						<HoverCardContent align="end" className="w-60 p-3">
							<div className="flex items-center gap-3">
								<AvatarStack
									people={[
										{
											id: person.userId,
											name: person.name,
											image: person.image,
											isActive: active,
										},
									]}
									size={32}
								/>
								<div className="min-w-0">
									<div className="truncate text-sm font-medium">
										{person.name}
									</div>
									<div className="text-xs text-muted-foreground">
										{active ? (
											<span className="text-foreground/80">
												<Trans context="presence">Active</Trans>
											</span>
										) : (
											t({ message: `Last seen ${lastSeen}` })
										)}
									</div>
								</div>
							</div>
						</HoverCardContent>
					</HoverCard>
				);
			}}
		/>
	);
}
