"use client";

import { useLingui } from "@lingui/react/macro";
import { presenceColor } from "@superset/shared/page-presence";
import { AvatarStack } from "../../../../atoms/AvatarStack";
import { cn } from "../../../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../ui/tooltip";
import { usePageViewers } from "../../stores/pagePresenceStore";

export function PageViewers({
	pageId,
	className,
}: {
	pageId: string | undefined;
	className?: string;
}) {
	const { t } = useLingui();
	const viewers = usePageViewers(pageId);

	const seen = new Set<string>();
	const people = viewers.flatMap((viewer) => {
		if (seen.has(viewer.key)) return [];
		seen.add(viewer.key);
		const number = viewer.guestNumber;
		return [
			{
				id: viewer.key,
				name:
					!viewer.guest && viewer.name
						? viewer.name
						: number
							? t({ message: `Guest ${number}` })
							: t({ message: "Guest" }),
				image: viewer.image,
				color: presenceColor(viewer.color),
			},
		];
	});
	if (people.length === 0) return null;
	const colors = new Map(people.map((person) => [person.id, person.color]));

	return (
		<div className={cn("flex shrink-0 items-center", className)}>
			<span className="sr-only">
				{t({ message: "Also viewing this page" })}
			</span>
			<ul className="sr-only">
				{people.map((person) => (
					<li key={person.id}>{person.name}</li>
				))}
			</ul>
			<span aria-hidden="true">
				<AvatarStack
					people={people}
					size={22}
					max={4}
					renderPerson={(person, avatar) => (
						<Tooltip>
							<TooltipTrigger asChild>
								<span
									className="block size-full rounded-full [&_[data-slot=avatar-fallback]]:bg-transparent [&_[data-slot=avatar-fallback]]:font-medium [&_[data-slot=avatar-fallback]]:text-white"
									style={{ backgroundColor: colors.get(person.id) }}
								>
									{avatar}
								</span>
							</TooltipTrigger>
							<TooltipContent side="bottom">{person.name}</TooltipContent>
						</Tooltip>
					)}
				/>
			</span>
		</div>
	);
}
