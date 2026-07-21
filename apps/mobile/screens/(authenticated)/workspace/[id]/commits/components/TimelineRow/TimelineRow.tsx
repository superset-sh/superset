import type { ReactNode } from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";

// The gutter spans the full row height — vertical spacing lives inside the
// content slot — so consecutive rows' rail segments meet without gaps, and
// the segments butt against the dot instead of passing behind it.
export function TimelineRow({
	first,
	last,
	children,
}: {
	first: boolean;
	last: boolean;
	children: ReactNode;
}) {
	return (
		<View className="flex-row gap-3">
			<View className="w-3 items-center">
				<View className={cn("bg-border h-[18px] w-px", first && "opacity-0")} />
				<View className="bg-neutral-600 size-2 rounded-full" />
				<View className={cn("bg-border w-px flex-1", last && "opacity-0")} />
			</View>
			<View className="flex-1 flex-row gap-3 py-3">{children}</View>
		</View>
	);
}
