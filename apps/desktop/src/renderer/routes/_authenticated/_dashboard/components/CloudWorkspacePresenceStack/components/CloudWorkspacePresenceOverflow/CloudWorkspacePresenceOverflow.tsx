import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";

interface CloudWorkspacePresenceOverflowProps {
	people: CloudWorkspaceRow["presence"];
	label: string;
	now: Date;
	isActive: (lastSeenAt: Date) => boolean;
	onOpenPerson: (userId: string) => void;
}

export function CloudWorkspacePresenceOverflow({
	people,
	label,
	now,
	isActive,
	onOpenPerson,
}: CloudWorkspacePresenceOverflowProps) {
	const { t } = useLingui();
	const { formatCompactRelativeTime } = useFormat();
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Show everyone who opened this workspace" })}
					className="text-[10px] tabular-nums text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
				>
					{label}
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-60 p-1">
				{people.map((person) => {
					const active = isActive(person.lastSeenAt);
					const lastSeen = formatCompactRelativeTime(person.lastSeenAt, now);
					return (
						<button
							key={person.userId}
							type="button"
							onClick={() => onOpenPerson(person.userId)}
							className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-fill-hover"
						>
							<AvatarStack
								people={[
									{
										id: person.userId,
										name: person.name,
										image: person.image,
										isActive: active,
									},
								]}
								size={20}
							/>
							<span className="min-w-0 flex-1 truncate">{person.name}</span>
							<span className="shrink-0 text-[11px] text-muted-foreground">
								{active ? (
									<Trans context="presence">Active</Trans>
								) : (
									t({ message: `Last seen ${lastSeen}` })
								)}
							</span>
						</button>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}
