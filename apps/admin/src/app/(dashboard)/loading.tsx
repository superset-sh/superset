import { Skeleton } from "@superset/ui/skeleton";

export default function DashboardLoading() {
	return (
		<div className="space-y-6 p-4">
			<Skeleton className="h-8 w-64" />
			<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
				{Array.from({ length: 6 }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
					<Skeleton key={i} className="h-[320px] w-full" />
				))}
			</div>
		</div>
	);
}
