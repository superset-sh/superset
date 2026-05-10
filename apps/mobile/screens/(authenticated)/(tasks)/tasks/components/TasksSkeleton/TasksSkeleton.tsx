import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROWS = 5;

export function TasksSkeleton() {
	return (
		<View className="gap-6">
			{[0, 1].map((section) => (
				<View key={section} className="gap-2">
					<View className="px-2">
						<Skeleton className="h-3 w-24" />
					</View>
					<View className="gap-1.5">
						{Array.from({ length: SKELETON_ROWS }).map((_, i) => (
							<View
								// biome-ignore lint/suspicious/noArrayIndexKey: static count
								key={i}
								className="flex-row items-center gap-3 rounded-xl bg-card px-4 py-3"
								style={{ minHeight: 44 }}
							>
								<Skeleton className="h-2.5 w-2.5 rounded-full" />
								<View className="flex-1 gap-1.5">
									<Skeleton className="h-4 w-3/4" />
									<Skeleton className="h-3 w-1/3" />
								</View>
							</View>
						))}
					</View>
				</View>
			))}
		</View>
	);
}
