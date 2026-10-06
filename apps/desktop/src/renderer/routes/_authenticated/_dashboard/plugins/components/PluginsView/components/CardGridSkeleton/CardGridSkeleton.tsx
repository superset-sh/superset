import { Skeleton } from "@superset/ui/skeleton";

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
	return (
		<section className="flex flex-col gap-3">
			<Skeleton className="h-5 w-24" />
			<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
				{Array.from({ length: count }, (_, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
						key={index}
						className="flex items-center gap-3 rounded-lg p-3"
					>
						<Skeleton className="size-9 shrink-0 rounded-lg" />
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-3 w-full max-w-56" />
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
