"use client";

import { useLingui } from "@lingui/react/macro";
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
	if (viewers.length === 0) return null;
	const colors = new Map(viewers.map((viewer) => [viewer.id, viewer.color]));

	return (
		<div className={cn("flex shrink-0 items-center", className)}>
			<span className="sr-only">
				{t({ message: "Also viewing this page" })}
			</span>
			<ul className="sr-only">
				{viewers.map((viewer) => (
					<li key={viewer.id}>{viewer.name}</li>
				))}
			</ul>
			<span aria-hidden="true">
				<AvatarStack
					people={viewers}
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
