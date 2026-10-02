import { useFormat } from "@superset/i18n/react";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import type { TimelineActorValue } from "renderer/routes/_authenticated/_dashboard/components/TimelineActor";

interface TimelineItemProps {
	actor: TimelineActorValue;
	/** Shown in the rail when no person did it. */
	systemIcon: IconType;
	at: Date;
	now: Date;
	isLast: boolean;
	sentence: ReactNode;
	children?: ReactNode;
}

export function TimelineItem({
	actor,
	systemIcon: SystemIcon,
	at,
	now,
	isLast,
	sentence,
	children,
}: TimelineItemProps) {
	const { formatCompactRelativeTime } = useFormat();
	return (
		<div className="relative flex gap-3 pb-5 text-[13px] leading-5 text-muted-foreground">
			{!isLast && (
				<span className="absolute top-3 -bottom-3 left-[15.5px] w-px bg-border" />
			)}
			<span className="relative flex h-6 w-8 shrink-0 items-center justify-center bg-background">
				{actor.kind === "user" ? (
					<AvatarStack
						people={[
							{
								id: actor.person.userId,
								name: actor.person.name,
								image: actor.person.image,
							},
						]}
						size={20}
					/>
				) : (
					<SystemIcon className="size-4" />
				)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex min-h-6 flex-wrap items-center gap-x-1">
					{sentence}
					<span>
						<span aria-hidden="true">· </span>
						{formatCompactRelativeTime(at, at > now ? at : now)}
					</span>
				</div>
				{children}
			</div>
		</div>
	);
}
