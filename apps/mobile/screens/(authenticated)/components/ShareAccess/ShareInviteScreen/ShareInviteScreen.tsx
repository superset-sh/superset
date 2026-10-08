import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
	type InviteNewMode,
	inviteSuggestions,
	type ShareAddRequest,
	type ShareDirectory,
	type ShareGrantee,
	type ShareGranteeRef,
	type ShareRoleOption,
	type StagedPick,
	stagedKey,
} from "@superset/shared/sharing";
import * as Haptics from "expo-haptics";
import {
	type NativeStackNavigationProp,
	Stack,
	useNavigation,
	useRouter,
} from "expo-router";
import { Lock, UserPlus, Users } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView } from "react-native";
import type { SearchBarCommands } from "react-native-screens";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useShareInviteStore } from "../stores/shareInviteStore";
import { SuggestionRow } from "./components/SuggestionRow";

interface ShareInviteScreenProps {
	directory: ShareDirectory;
	grantees: ShareGrantee[];
	ownerId: string | null;
	organizationName: string;
	inviteNew: InviteNewMode;
	roles: ShareRoleOption[];
	defaultRole: string;
	onUpgrade: () => void;
	/** Opens the permission picker for the pick being edited. */
	onOpenPermission: () => void;
	/** Shares with one role's worth of picks; resolves true once they have access. */
	onSubmit: (request: ShareAddRequest) => Promise<boolean>;
}

export function ShareInviteScreen({
	directory,
	grantees,
	ownerId,
	organizationName,
	inviteNew,
	roles,
	defaultRole,
	onUpgrade,
	onOpenPermission,
	onSubmit,
}: ShareInviteScreenProps) {
	const { t } = useLingui();
	const router = useRouter();
	const navigation =
		useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
	const theme = useTheme();
	const searchBarRef = useRef<SearchBarCommands>(null);
	const [query, setQuery] = useState("");
	const staged = useShareInviteStore((state) => state.staged);
	const pickRoles = useShareInviteStore((state) => state.roles);
	const stageInStore = useShareInviteStore((state) => state.stage);
	const unstageInStore = useShareInviteStore((state) => state.unstage);
	const reset = useShareInviteStore((state) => state.reset);
	const edit = useShareInviteStore((state) => state.edit);
	const [inviteError, setInviteError] = useState(false);
	const [busy, setBusy] = useState(false);

	useEffect(() => reset(), [reset]);

	// The search bar only exists once the push has finished.
	useEffect(
		() =>
			navigation.addListener("transitionEnd", (event) => {
				if (!event.data.closing) searchBarRef.current?.focus();
			}),
		[navigation],
	);

	const items = useMemo(
		() =>
			inviteSuggestions({
				query,
				directory,
				grantees,
				staged,
				ownerId,
				inviteNew,
				browse: true,
			}),
		[query, directory, grantees, staged, ownerId, inviteNew],
	);

	const stage = (pick: StagedPick) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		stageInStore(pick, defaultRole);
		setInviteError(false);
		if (query) {
			searchBarRef.current?.clearText();
			setQuery("");
		}
	};

	const openPick = (pick: StagedPick) => {
		edit(stagedKey(pick));
		onOpenPermission();
	};

	const submit = async () => {
		if (!staged.length || busy) return;
		setBusy(true);
		const roleOf = (pick: StagedPick) =>
			pickRoles[stagedKey(pick)] ?? defaultRole;
		const groups = [...new Set(staged.map(roleOf))];
		let shared = true;
		for (const role of groups) {
			const picks = staged.filter((pick) => roleOf(pick) === role);
			shared = await onSubmit({
				grantees: picks.flatMap((p): ShareGranteeRef[] =>
					p.kind === "user"
						? [{ kind: "user", userId: p.person.userId }]
						: p.kind === "team"
							? [{ kind: "team", teamId: p.team.teamId }]
							: [],
				),
				emails: picks.flatMap((p) => (p.kind === "email" ? [p.email] : [])),
				role,
			});
			if (!shared) break;
			for (const pick of picks) unstageInStore(stagedKey(pick));
		}
		setBusy(false);
		if (shared) router.back();
	};

	const newPeople = staged.some((p) => p.kind === "email");
	const inviteTitle = (label: string) =>
		t({ message: `Invite ${label} to join ${organizationName}` });
	const roleLabel = (pick: StagedPick) =>
		(
			roles.find(
				(option) => option.id === (pickRoles[stagedKey(pick)] ?? defaultRole),
			) ?? roles[0]
		)?.label;

	return (
		<>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					accessibilityLabel={
						newPeople ? t({ message: "Invite" }) : t({ message: "Share" })
					}
					icon="checkmark"
					variant={staged.length ? "prominent" : "plain"}
					disabled={!staged.length || busy}
					onPress={() => void submit()}
				/>
			</Stack.Toolbar>
			<Stack.SearchBar
				ref={searchBarRef}
				placeholder={t({ message: "Names, emails, or teams" })}
				placement="stacked"
				hideWhenScrolling={false}
				hideNavigationBar={false}
				obscureBackground={false}
				autoCapitalize="none"
				inputType="email"
				textColor={theme.foreground}
				hintTextColor={theme.mutedForeground}
				tintColor={theme.foreground}
				onChangeText={(event) => {
					setQuery(event.nativeEvent.text);
					setInviteError(false);
				}}
				onCancelButtonPress={() => setQuery("")}
			/>

			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-10 pt-2"
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
			>
				{staged.length ? (
					<>
						<Text className="text-muted-foreground mb-1 text-[15px]">
							{t({ message: "Selected" })}
						</Text>
						{staged.map((pick) =>
							pick.kind === "user" ? (
								<SuggestionRow
									key={stagedKey(pick)}
									person={pick.person}
									title={pick.person.name}
									detail={pick.person.email}
									trailing={roleLabel(pick)}
									chevron
									onPress={() => openPick(pick)}
								/>
							) : pick.kind === "team" ? (
								<SuggestionRow
									key={stagedKey(pick)}
									icon={Users}
									title={pick.team.name}
									detail={t({
										message: plural(pick.team.memberIds.length, {
											one: "# person",
											other: "# people",
										}),
									})}
									trailing={roleLabel(pick)}
									chevron
									onPress={() => openPick(pick)}
								/>
							) : (
								<SuggestionRow
									key={stagedKey(pick)}
									icon={UserPlus}
									dashed
									title={pick.email}
									detail={t({ message: `Invite to ${organizationName}` })}
									trailing={roleLabel(pick)}
									chevron
									onPress={() => openPick(pick)}
								/>
							),
						)}
					</>
				) : null}

				<Text
					className={cn(
						"text-muted-foreground mb-1 text-[15px]",
						staged.length > 0 && "mt-6",
					)}
				>
					{query
						? t({ message: "Results" })
						: t({ message: "Select a person" })}
				</Text>
				{items.map((item, index) => {
					const key = `${item.kind}-${index}`;
					switch (item.kind) {
						case "heading":
							return (
								<Text
									key={key}
									className="text-muted-foreground pt-2 pb-1 text-xs"
								>
									{t({ message: "Keep typing an email to invite" })}
								</Text>
							);
						case "empty":
							return (
								<Text
									key={key}
									className="text-muted-foreground py-2.5 text-xs"
								>
									{t({ message: `No one in ${organizationName} matches` })}
								</Text>
							);
						case "blocked":
							return (
								<SuggestionRow
									key={key}
									icon={Lock}
									title={t({ message: `Invite to ${organizationName}` })}
									detail={t({
										message: `Only ${organizationName} admins can invite new people`,
									})}
									disabled
								/>
							);
						case "team":
							return (
								<SuggestionRow
									key={key}
									icon={Users}
									title={item.team.name}
									trailing={
										item.hasAccess ? t({ message: "Has access" }) : undefined
									}
									disabled={item.hasAccess}
									onPress={() => stage({ kind: "team", team: item.team })}
								/>
							);
						case "member":
							return (
								<SuggestionRow
									key={key}
									person={item.person}
									title={item.person.name}
									detail={item.person.email}
									trailing={
										item.hasAccess ? t({ message: "Has access" }) : undefined
									}
									disabled={item.hasAccess}
									onPress={() => stage({ kind: "user", person: item.person })}
								/>
							);
						case "invite":
							return (
								<SuggestionRow
									key={key}
									icon={UserPlus}
									dashed
									title={item.completion ? item.email : inviteTitle(item.email)}
									trailing={
										item.invited ? t({ message: "Invited" }) : undefined
									}
									disabled={item.invited}
									onPress={() =>
										inviteNew === "upgrade"
											? onUpgrade()
											: stage({ kind: "email", email: item.email })
									}
								/>
							);
						case "invalid":
							return (
								<SuggestionRow
									key={key}
									icon={UserPlus}
									dashed
									title={inviteTitle(item.text)}
									error={
										inviteError
											? t({ message: "Enter a full email address" })
											: undefined
									}
									onPress={() => setInviteError(true)}
								/>
							);
					}
					return null;
				})}
			</ScrollView>
		</>
	);
}
