"use client";

import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { AppWindow } from "lucide-react";

interface OpenInSupersetButtonProps {
	slug: string;
}

export function OpenInSupersetButton({ slug }: OpenInSupersetButtonProps) {
	const { t } = useLingui();
	const label = t({ message: "Open in Superset" });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					asChild
					size="icon-sm"
					variant="ghost"
					aria-label={label}
					className="size-7 text-muted-foreground"
				>
					<a href={`superset://pages/${slug}`}>
						<AppWindow className="size-3.5" />
					</a>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
