import { GlobeIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Loader } from "./loader";
import { ToolCallRow } from "./tool-call-row";

type WebFetchToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

type WebFetchToolProps = {
	url?: string;
	content?: string;
	bytes?: number;
	statusCode?: number;
	state: WebFetchToolState;
	className?: string;
};

const MAX_CONTENT_LINES = 18;

function extractHostname(url: string): string {
	try {
		return new URL(url).hostname.replace("www.", "");
	} catch {
		return url.slice(0, 30);
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const WebFetchTool = ({
	url,
	content,
	bytes,
	statusCode,
	state,
	className,
}: WebFetchToolProps) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const isPending = state === "input-streaming" || state === "input-available";
	const isError = state === "output-error";
	const isSuccess = statusCode === 200;
	const hasContent = Boolean(content);
	const hostname = url ? extractHostname(url) : "";

	const lineCount = content ? content.trimEnd().split("\n").length : 0;
	const isOverflowing = lineCount > MAX_CONTENT_LINES;

	const statusNode = isPending ? (
		<View className="size-6 items-center justify-center">
			<Loader size={12} />
		</View>
	) : isError || !isSuccess ? (
		<Text className="text-destructive text-xs">
			{statusCode ? `Error ${statusCode}` : "Failed"}
		</Text>
	) : bytes !== undefined ? (
		<Text className="text-muted-foreground text-xs">{formatBytes(bytes)}</Text>
	) : null;

	return (
		<ToolCallRow
			className={className}
			description={hostname || undefined}
			icon={GlobeIcon}
			isError={isError}
			isPending={isPending}
			statusNode={statusNode}
			title="Web Fetch"
		>
			{hasContent ? (
				<View className="px-2.5 py-2">
					<Text
						className="font-mono text-foreground text-xs"
						numberOfLines={
							isOverflowing && !isExpanded ? MAX_CONTENT_LINES : undefined
						}
					>
						{content}
					</Text>
					{isOverflowing ? (
						<Pressable
							accessibilityRole="button"
							hitSlop={8}
							onPress={() => setIsExpanded((prev) => !prev)}
						>
							<Text className="mt-1 text-muted-foreground text-xs underline">
								{isExpanded ? "Show less" : "Show more"}
							</Text>
						</Pressable>
					) : null}
				</View>
			) : undefined}
		</ToolCallRow>
	);
};
