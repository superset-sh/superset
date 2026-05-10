import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

const PANE_COUNT = 3;

export function WorkspaceDetailSkeleton() {
	return (
		<View className="gap-4">
			{Array.from({ length: PANE_COUNT }).map((_, i) => (
				<View
					// biome-ignore lint/suspicious/noArrayIndexKey: static count
					key={i}
					className="rounded-xl bg-card p-4 gap-3"
				>
					<Skeleton className="h-5 w-1/3" />
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-16 w-full" />
				</View>
			))}
		</View>
	);
}
