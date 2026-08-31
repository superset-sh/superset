import { cn } from "../../lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("bg-grayAlpha-200 animate-pulse rounded", className)}
			{...props}
		/>
	);
}

export { Skeleton };
