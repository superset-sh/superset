import { formatDate } from "@superset/i18n/format";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { FileText, Globe, Lock } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { OrgPage } from "../../hooks/usePages";

const EDIT_THRESHOLD_MS = 60_000;

export function PageRow({ page }: { page: OrgPage }) {
	const router = useRouter();

	const edited = new Date(page.updatedAt).getTime();
	const created = new Date(page.createdAt).getTime();
	// Absolute, not relative: Hermes ships no Intl.RelativeTimeFormat and
	// lib/intl-polyfills only installs Locale and PluralRules, so
	// formatRelativeTime throws on render here. Intl.DateTimeFormat is native.
	const timestamp = formatDate(
		edited - created > EDIT_THRESHOLD_MS ? edited : created,
	);

	return (
		<Pressable
			className="bg-background flex-row items-center gap-3 rounded-xl px-3 py-2 active:opacity-60"
			accessibilityRole="button"
			accessibilityLabel={page.title ?? page.slug}
			onPress={() =>
				router.push({
					pathname: "/(authenticated)/(home)/pages/[slug]",
					params: { slug: page.slug },
				})
			}
		>
			<View className="bg-muted h-12 w-16 items-center justify-center overflow-hidden rounded-md">
				{page.thumbnailUrl ? (
					<Image
						source={{ uri: page.thumbnailUrl }}
						style={{ height: "100%", width: "100%" }}
						contentFit="cover"
						contentPosition="top center"
						transition={120}
					/>
				) : (
					<Icon as={FileText} className="text-muted-foreground size-5" />
				)}
			</View>

			<View className="flex-1">
				<Text className="text-[15px] font-medium" numberOfLines={1}>
					{page.title ?? page.slug}
				</Text>
				<View className="flex-row items-center gap-1">
					<Icon
						as={page.visibility === "org" ? Globe : Lock}
						className="text-muted-foreground size-3"
					/>
					<Text
						className="text-muted-foreground shrink text-xs"
						numberOfLines={1}
					>
						{page.ownerName ? `${page.ownerName} · ${timestamp}` : timestamp}
					</Text>
				</View>
			</View>
		</Pressable>
	);
}
