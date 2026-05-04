import { Skeleton } from "@superset/ui/skeleton";

export function ProfileSkeleton() {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-8">
				<div className="flex-1">
					<Skeleton className="h-4 w-16 mb-2" />
					<Skeleton className="h-3 w-40" />
				</div>
				<div className="flex items-center gap-3">
					<Skeleton className="size-12 rounded-full" />
					<Skeleton className="h-8 w-20" />
				</div>
			</div>
			<div className="flex items-center justify-between gap-8">
				<Skeleton className="h-4 w-12" />
				<Skeleton className="h-9 w-80" />
			</div>
			<div className="flex items-center justify-between gap-8">
				<Skeleton className="h-4 w-12" />
				<Skeleton className="h-9 w-80" />
			</div>
		</div>
	);
}
