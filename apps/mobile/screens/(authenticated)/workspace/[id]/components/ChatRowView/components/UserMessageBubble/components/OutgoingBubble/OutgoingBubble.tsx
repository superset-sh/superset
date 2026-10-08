import type { ReactNode } from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";

export function OutgoingBubble({
	dimmed = false,
	children,
}: {
	dimmed?: boolean;
	children: ReactNode;
}) {
	return (
		<View
			className={cn(
				"max-w-[82%] gap-1.5 self-end rounded-[22px] bg-[#2F2F2F] px-4 py-2.5",
				dimmed && "opacity-55",
			)}
		>
			{children}
		</View>
	);
}
