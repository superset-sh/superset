import { Card, CardContent } from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";

export function ProfileSkeleton() {
	return (
		<Card>
			<CardContent>
				<ul className="space-y-6">
					<li className="flex items-center justify-between gap-8 pb-6 border-b border-border">
						<div className="flex-1">
							<Skeleton className="h-4 w-16 mb-2" />
							<Skeleton className="h-3 w-40" />
						</div>
						<Skeleton className="h-8 w-8 rounded-full" />
					</li>
					<li className="flex items-center justify-between gap-8 pb-6 border-b border-border">
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-10 flex-1" />
					</li>
					<li className="flex items-center justify-between gap-8">
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-10 flex-1" />
					</li>
				</ul>
			</CardContent>
		</Card>
	);
}
