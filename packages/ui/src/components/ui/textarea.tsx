import type * as React from "react";

import { cn } from "../../lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"bg-input placeholder:text-muted-foreground focus-visible:ring-ring aria-invalid:ring-destructive/20 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded border-none px-3 py-2 text-base transition-colors outline-none focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
