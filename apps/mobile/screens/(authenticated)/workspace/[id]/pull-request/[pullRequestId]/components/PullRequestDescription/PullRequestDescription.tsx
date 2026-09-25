import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { Text } from "@/components/ui/text";
import { FadeOut } from "./components/FadeOut";
import { DESCRIPTION_MARKDOWN_STYLE } from "./constants";
import { stripHtml } from "./utils/stripHtml";

const COLLAPSED_HEIGHT = 280;

/** The description, clamped until asked for. */
export function PullRequestDescription({ body }: { body: string }) {
	const { t } = useLingui();
	const [expanded, setExpanded] = useState(false);
	const markdown = useMemo(() => stripHtml(body), [body]);
	const [measured, setMeasured] = useState<{
		body: string;
		height: number;
	} | null>(null);
	const fullHeight = measured?.body === markdown ? measured.height : null;
	const overflows = fullHeight !== null && fullHeight > COLLAPSED_HEIGHT;

	if (markdown === "") return null;

	return (
		<View className="mx-4 gap-1">
			<Text className="pb-1 font-semibold text-[21px] tracking-[-0.3px]">
				<Trans>Description</Trans>
			</Text>
			<View
				className="overflow-hidden"
				style={
					overflows && !expanded ? { height: COLLAPSED_HEIGHT } : undefined
				}
			>
				<View
					onLayout={(event) => {
						const height = event.nativeEvent.layout.height;
						if (fullHeight !== null || height <= 0) return;
						setMeasured({ body: markdown, height });
					}}
				>
					<EnrichedMarkdownText
						flavor="github"
						markdown={markdown}
						markdownStyle={DESCRIPTION_MARKDOWN_STYLE}
						onLinkPress={(event) => {
							void Linking.openURL(event.url);
						}}
						selectable
					/>
				</View>
				{overflows && !expanded ? <FadeOut height={56} /> : null}
			</View>
			{overflows ? (
				<Pressable
					accessibilityLabel={t({
						message: "Toggle description",
					})}
					accessibilityRole="button"
					className="self-start pt-1 pb-2 pr-3 active:opacity-60"
					onPress={() => setExpanded((open) => !open)}
				>
					<Text className="text-muted-foreground text-[15px]">
						{expanded ? t({ message: "See Less" }) : t({ message: "See More" })}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}
