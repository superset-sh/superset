import { useLingui } from "@lingui/react/macro";
import type {
	ShareGrantee,
	ShareGranteeRef,
	SharePerson,
	ShareRoleOption,
} from "@superset/shared/sharing";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Check, Link2, Search } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { GeneralAccess } from "../types";
import { granteeRefOf } from "../utils/granteeRefOf";
import { GeneralAccessRow } from "./components/GeneralAccessRow";
import { GranteeRow } from "./components/GranteeRow";
import { OwnerRow } from "./components/OwnerRow";

const COPIED_MS = 1500;
/** The people list scrolls on its own past this share of the screen, so the rest stays in view. */
const PEOPLE_MAX_HEIGHT = 0.42;

interface ShareAccessSheetProps {
	linkUrl: string | null;
	owner: SharePerson | null;
	/** False until the owner and grantees have loaded. */
	loaded: boolean;
	currentUserId: string | undefined;
	grantees: ShareGrantee[];
	canManage: boolean;
	readOnlyNote: string;
	roles: ShareRoleOption[];
	general: GeneralAccess;
	/** Shown after general access, such as a page's shared version. */
	extra?: ReactNode;
	onInvite: () => void;
	onOpenGrantee: (grantee: ShareGranteeRef) => void;
	onOpenGeneral: (mode: "who" | "level") => void;
}

export function ShareAccessSheet({
	linkUrl,
	owner,
	loaded,
	currentUserId,
	grantees,
	canManage,
	readOnlyNote,
	roles,
	general,
	extra,
	onInvite,
	onOpenGrantee,
	onOpenGeneral,
}: ShareAccessSheetProps) {
	const { t } = useLingui();
	const router = useRouter();
	const { height } = useWindowDimensions();
	const [copied, setCopied] = useState(false);

	const row = (grantee: ShareGrantee) => {
		const ref = granteeRefOf(grantee);
		return (
			<GranteeRow
				key={JSON.stringify(ref)}
				grantee={grantee}
				roles={roles}
				isYou={grantee.kind === "user" && grantee.userId === currentUserId}
				canManage={canManage}
				onPress={() => onOpenGrantee(ref)}
			/>
		);
	};

	const copyLink = async () => {
		if (!linkUrl) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		await Clipboard.setStringAsync(linkUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), COPIED_MS);
	};

	return (
		<>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Done" })}
					icon="checkmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>

			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-6 pt-2"
			>
				{canManage ? (
					<Pressable
						accessibilityRole="search"
						accessibilityLabel={t({ message: "Add people" })}
						onPress={onInvite}
						className="bg-muted mb-3 h-11 flex-row items-center gap-2 rounded-xl px-3 active:opacity-70"
					>
						<Icon as={Search} className="text-muted-foreground size-4" />
						<Text className="text-muted-foreground text-base">
							{t({ message: "Add people or teams by name or email" })}
						</Text>
					</Pressable>
				) : null}

				<ScrollView
					style={{ maxHeight: Math.round(height * PEOPLE_MAX_HEIGHT) }}
					nestedScrollEnabled
				>
					{grantees.filter((grantee) => grantee.kind === "team").map(row)}
					{owner ? (
						<OwnerRow owner={owner} isYou={owner.userId === currentUserId} />
					) : loaded ? (
						<Text className="text-muted-foreground py-2 text-xs">
							{t({ message: "The owner's account no longer exists." })}
						</Text>
					) : null}
					{grantees.filter((grantee) => grantee.kind === "user").map(row)}
					{grantees.filter((grantee) => grantee.kind === "invitation").map(row)}
				</ScrollView>
				{loaded && !canManage ? (
					<Text className="text-muted-foreground mt-2 text-xs">
						{readOnlyNote}
					</Text>
				) : null}

				<View className="border-border -mx-4 mt-4 border-t px-4 pt-4">
					<Text className="text-muted-foreground mb-1 text-[15px]">
						{t({ message: "General access" })}
					</Text>
					<GeneralAccessRow
						general={general}
						roles={roles}
						canManage={canManage}
						onOpenWho={() => onOpenGeneral("who")}
						onOpenLevel={() => onOpenGeneral("level")}
					/>
				</View>

				{extra ? <View className="mt-3">{extra}</View> : null}

				<Pressable
					accessibilityRole="button"
					disabled={!linkUrl}
					onPress={() => void copyLink()}
					className="bg-primary mt-5 h-12 flex-row items-center justify-center gap-2 rounded-xl active:opacity-80"
				>
					<Icon
						as={copied ? Check : Link2}
						className="text-primary-foreground size-4"
					/>
					<Text className="text-primary-foreground text-base font-semibold">
						{copied ? t({ message: "Copied" }) : t({ message: "Copy link" })}
					</Text>
				</Pressable>
			</ScrollView>
		</>
	);
}
