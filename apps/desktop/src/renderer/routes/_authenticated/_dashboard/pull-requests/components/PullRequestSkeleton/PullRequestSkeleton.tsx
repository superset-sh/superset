import { Skeleton } from "@superset/ui/skeleton";
import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";
import "./pull-request-skeleton.css";

/** The shared Skeleton with the page's sweeping shimmer in place of the pulse. */
export function PullRequestSkeleton({
	className,
	...props
}: ComponentProps<typeof Skeleton>) {
	return <Skeleton className={cn("pr-skeleton", className)} {...props} />;
}
