import * as Linking from "expo-linking";
import { ExternalLinkIcon, GlobeIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Loader } from "./loader";
import { ToolCallRow } from "./tool-call-row";

type WebSearchToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

type SearchResult = { title: string; url: string };

type WebSearchToolProps = {
	query?: string;
	results: SearchResult[];
	state: WebSearchToolState;
	className?: string;
};

export const WebSearchTool = ({
	query,
	results,
	state,
	className,
}: WebSearchToolProps) => {
	const isPending = state === "input-streaming" || state === "input-available";
	const isError = state === "output-error";
	const hasResults = results.length > 0;

	const statusNode = isPending ? (
		<View className="size-6 items-center justify-center">
			<Loader size={12} />
		</View>
	) : isError ? (
		<Text className="text-destructive text-xs">Failed</Text>
	) : null;

	return (
		<ToolCallRow
			className={className}
			description={query}
			icon={GlobeIcon}
			isError={isError}
			isPending={isPending}
			statusNode={statusNode}
			title="Web Search"
		>
			{hasResults ? (
				<View>
					{results.map((result, idx) => (
						<Pressable
							accessibilityRole="link"
							className="flex-row items-start gap-2 px-2.5 py-1.5 active:bg-muted/30"
							key={`${result.url}-${idx}`}
							onPress={() => Linking.openURL(result.url)}
						>
							<Icon
								as={ExternalLinkIcon}
								className="mt-0.5 size-3 shrink-0 text-muted-foreground"
							/>
							<View className="min-w-0 flex-1">
								<Text className="text-foreground text-xs" numberOfLines={1}>
									{result.title}
								</Text>
								<Text
									className="text-[10px] text-muted-foreground"
									numberOfLines={1}
								>
									{result.url}
								</Text>
							</View>
						</Pressable>
					))}
				</View>
			) : undefined}
		</ToolCallRow>
	);
};
