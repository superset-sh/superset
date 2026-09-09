import { useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { getInitials } from "@superset/shared/names";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
	Building2,
	Check,
	Link2,
	Lock,
	type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { usePageQuery } from "../../hooks/usePages";
import {
	type PageVisibility,
	usePageAccessQuery,
	usePageSharingActions,
	usePageVersionsQuery,
} from "../hooks/usePageSharing";

const COPIED_MS = 1500;

export function PageShareSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const { data: session } = useSession();
	const [copied, setCopied] = useState(false);

	const page = usePageQuery(slug);
	const access = usePageAccessQuery(slug);
	const versions = usePageVersionsQuery(slug);
	const { setVisibility, setSharedVersion } = usePageSharingActions(
		page.data?.id,
		slug,
	);

	const owner = access.data?.owner;
	const visibility = (page.data?.visibility ?? "just_me") as PageVisibility;
	const sharedVersion = page.data?.sharedVersion ?? null;
	const latestVersion = page.data?.latestVersion ?? null;
	const editable =
		page.data !== undefined &&
		session?.user.id !== undefined &&
		page.data.createdByUserId === session.user.id;
	const busy = setVisibility.isPending || setSharedVersion.isPending;
	const locked = busy || !editable;

	const copyLink = async () => {
		const url = page.data?.url;
		if (!url) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		await Clipboard.setStringAsync(url);
		setCopied(true);
		setTimeout(() => setCopied(false), COPIED_MS);
	};

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>

			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-10 pt-1"
			>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t({ message: "Copy link" })}
					onPress={() => void copyLink()}
					className="border-border mb-5 min-h-11 flex-row items-center justify-center gap-2 rounded-xl border py-3 active:opacity-60"
				>
					<Icon
						as={copied ? Check : Link2}
						className={cn(
							"size-4",
							copied ? "text-primary" : "text-foreground",
						)}
					/>
					<Text className="text-[15px] font-medium">
						{copied ? t({ message: "Copied" }) : t({ message: "Copy link" })}
					</Text>
				</Pressable>

				<SectionLabel>{t({ message: "People with access" })}</SectionLabel>
				{owner ? (
					<View className="mb-5 flex-row items-center gap-2.5">
						<View className="bg-muted size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
							{owner.image ? (
								<Image
									source={{ uri: owner.image }}
									style={{ height: "100%", width: "100%" }}
									contentFit="cover"
								/>
							) : (
								<Text className="text-muted-foreground text-[11px] font-medium">
									{getInitials(owner.name) || "?"}
								</Text>
							)}
						</View>
						<View className="min-w-0 flex-1">
							<Text className="text-[15px]" numberOfLines={1}>
								{owner.name}
							</Text>
							<Text className="text-muted-foreground text-xs" numberOfLines={1}>
								{owner.email}
							</Text>
						</View>
						<Text className="text-muted-foreground shrink-0 text-xs">
							{t({ message: "Owner" })}
						</Text>
					</View>
				) : (
					<Text className="text-muted-foreground mb-5 text-xs">
						{t({ message: "The owner's account no longer exists." })}
					</Text>
				)}

				{page.data && !editable ? (
					<Text className="text-muted-foreground mb-4 text-xs">
						{t({
							message:
								"Only the person who created this page can change these.",
						})}
					</Text>
				) : null}

				<SectionLabel>{t({ message: "General access" })}</SectionLabel>
				<Text className="text-muted-foreground mb-1.5 text-xs">
					{t({ message: "Who can open this page from its link" })}
				</Text>
				<ChoiceRow
					icon={Lock}
					label={t({ message: "Only you" })}
					selected={visibility === "just_me"}
					disabled={locked}
					onPress={() => setVisibility.mutate("just_me")}
				/>
				<ChoiceRow
					icon={Building2}
					label={t({ message: "Anyone in your organization" })}
					selected={visibility === "org"}
					disabled={locked}
					onPress={() => setVisibility.mutate("org")}
				/>

				<View className="h-5" />

				<SectionLabel>{t({ message: "Shared version" })}</SectionLabel>
				<Text className="text-muted-foreground mb-1.5 text-xs">
					{sharedVersion === null
						? t({ message: "Everyone sees new versions as they are published" })
						: t({
								message: `Everyone stays on v${sharedVersion} until you change this`,
							})}
				</Text>
				<ChoiceRow
					label={
						latestVersion === null
							? t({ message: "Latest" })
							: t({ message: `Latest (v${latestVersion})` })
					}
					selected={sharedVersion === null}
					disabled={locked}
					onPress={() => setSharedVersion.mutate(null)}
				/>
				{(versions.data ?? [])
					.filter((entry) => entry.version !== latestVersion)
					.map((entry) => (
						<ChoiceRow
							key={entry.version}
							label={t({ message: `Version ${entry.version}` })}
							detail={entry.label ?? formatDate(entry.createdAt)}
							selected={sharedVersion === entry.version}
							disabled={locked}
							onPress={() => setSharedVersion.mutate(entry.version)}
						/>
					))}
			</ScrollView>
		</>
	);
}

function SectionLabel({ children }: { children: string }) {
	return <Text className="mb-1 text-[15px] font-semibold">{children}</Text>;
}

function ChoiceRow({
	icon,
	label,
	detail,
	selected,
	disabled,
	onPress,
}: {
	icon?: LucideIcon;
	label: string;
	detail?: string;
	selected: boolean;
	disabled: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected, disabled }}
			disabled={disabled}
			onPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onPress();
			}}
			className={cn(
				"min-h-11 flex-row items-center gap-2.5 py-2.5 active:opacity-60",
				disabled && "opacity-50",
			)}
		>
			{icon ? (
				<Icon as={icon} className="text-muted-foreground size-4" />
			) : null}
			<View className="min-w-0 flex-1">
				<Text className="text-[15px]">{label}</Text>
				{detail ? (
					<Text className="text-muted-foreground text-xs" numberOfLines={1}>
						{detail}
					</Text>
				) : null}
			</View>
			{selected ? <Icon as={Check} className="text-primary size-4" /> : null}
		</Pressable>
	);
}
