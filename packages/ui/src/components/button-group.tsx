import type * as React from "react";

import { cn } from "../lib/utils";

function ButtonGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex items-center justify-center -space-x-px [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none [&>*:not(:first-child):not(:last-child)]:rounded-none",
				className,
			)}
			{...props}
		/>
	);
}

export { ButtonGroup };
