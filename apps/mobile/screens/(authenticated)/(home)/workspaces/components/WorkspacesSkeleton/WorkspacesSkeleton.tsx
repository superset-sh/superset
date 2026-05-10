import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROWS = 5;

/**
 * Doherty Threshold + Goal-Gradient: showing structure on first paint
 * tells the user "your data is on its way" instead of an empty stage.
 */
export function WorkspacesSkeleton() {
	return (
		<View className="gap-6">
			{[0, 1].map((section) => (
				<View key={section} className="gap-2">
					<View className="px-2">
						<Skeleton className="h-3 w-20" />
					</View>
					<View className="gap-1.5">
						{Array.from({ length: SKELETON_ROWS }).map((_, i) => (
							<View
								// biome-ignore lint/suspicious/noArrayIndexKey: static count
								key={i}
								className="flex-row items-center gap-3 rounded-xl bg-card px-4 py-3"
								style={{ minHeight: 44 }}
							>
								<View className="flex-1 gap-1.5">
									<Skeleton className="h-4 w-2/3" />
									<Skeleton className="h-3 w-1/2" />
								</View>
								<Skeleton className="h-4 w-4 rounded-full" />
							</View>
						))}
					</View>
				</View>
			))}
		</View>
	);
}
