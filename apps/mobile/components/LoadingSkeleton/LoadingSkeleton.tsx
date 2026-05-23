import { View, type ViewProps } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type LoadingSkeletonDensity = "sparse" | "dense";

export type LoadingSkeletonProps = ViewProps & {
	/** sparse = 3 messages, dense = 6 messages */
	density?: LoadingSkeletonDensity;
	/** Overrides density's default message count when provided. */
	messageCount?: number;
};

type Row = {
	id: string;
	align: "left" | "right";
	width: number;
};

// 12 stable rows — pick the first N. Each id is the chat-relative source label,
// so the key is content-derived (the rows ARE distinct slots, not positions).
const ROWS: ReadonlyArray<Row> = [
	{ id: "assistant-greeting", align: "left", width: 0.78 },
	{ id: "user-reply-short", align: "right", width: 0.5 },
	{ id: "assistant-mid", align: "left", width: 0.64 },
	{ id: "user-followup", align: "right", width: 0.36 },
	{ id: "assistant-detail", align: "left", width: 0.84 },
	{ id: "user-question", align: "right", width: 0.58 },
	{ id: "assistant-toolcall", align: "left", width: 0.7 },
	{ id: "user-confirmation", align: "right", width: 0.42 },
	{ id: "assistant-result", align: "left", width: 0.76 },
	{ id: "user-thanks", align: "right", width: 0.3 },
	{ id: "assistant-closing", align: "left", width: 0.6 },
	{ id: "user-final", align: "right", width: 0.46 },
];

export function LoadingSkeleton({
	density = "sparse",
	messageCount,
	className,
	...props
}: LoadingSkeletonProps) {
	const count = Math.min(
		messageCount ?? (density === "dense" ? 6 : 3),
		ROWS.length,
	);
	const rows = ROWS.slice(0, count);

	return (
		<View
			accessibilityRole="progressbar"
			accessibilityLabel="Loading chat history"
			className={cn("gap-4 px-4 py-6", className)}
			{...props}
		>
			{rows.map((row) => (
				<View
					key={row.id}
					className={cn(
						"max-w-[78%]",
						row.align === "right" ? "self-end" : "self-start",
					)}
					style={{ width: `${Math.round(row.width * 100)}%` }}
				>
					<Skeleton
						className={cn(
							"h-14 rounded-2xl",
							row.align === "right" ? "bg-primary/20" : "bg-secondary",
						)}
					/>
				</View>
			))}
		</View>
	);
}
