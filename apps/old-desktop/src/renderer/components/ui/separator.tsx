import type * as React from "react";

import { cn } from "renderer/lib/utils";

function Separator({
	className,
	orientation = "horizontal",
	...props
}: React.ComponentProps<"div"> & {
	orientation?: "horizontal" | "vertical";
}) {
	return (
		<div
			data-slot="separator"
			className={cn(
				"shrink-0 bg-border",
				orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
				className,
			)}
			{...props}
		/>
	);
}

export { Separator };
