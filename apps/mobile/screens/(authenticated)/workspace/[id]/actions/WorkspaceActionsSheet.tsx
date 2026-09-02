import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatDistanceToNow } from "date-fns";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
	PencilIcon,
	PinIcon,
	ShareIcon,
	Trash2Icon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useHostProjects } from "@/hooks/useHostProjects";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { isSandboxHost } from "@/lib/sandbox-access";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";
import { useWorkspaceChangeset } from "../hooks/useWorkspaceChangeset";
import { useWorkspaceHeaderActions } from "../hooks/useWorkspaceHeaderActions";

function CircleAction({
	icon,
	label,
	active,
	onPress,
}: {
	icon: ReactNode;
	label: string;
	active?: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityLabel={label}
			onPress={onPress}
			className={
				active
					? "bg-foreground size-12 items-center justify-center rounded-full active:opacity-60"
					: "bg-secondary size-12 items-center justify-center rounded-full active:opacity-60"
			}
		>
			{icon}
		</Pressable>
	);
}

function InfoRow({
	label,
	value,
	isLast,
}: {
	label: string;
	value: string;
	isLast?: boolean;
}) {
	return (
		<View
			className={
				isLast
					? "flex-row items-center justify-between py-3.5"
					: "border-border/60 flex-row items-center justify-between border-b py-3.5"
			}
		>
			<Text className="text-[15px]">{label}</Text>
			<Text className="text-muted-foreground text-[15px]" numberOfLines={1}>
				{value}
			</Text>
		</View>
	);
}

/**
 * Workspace sheet, Cursor's layout: centered name, circular actions
 * (edit / pin / share), a simple Info list led by the project identity,
 * Delete at the bottom.
 */
export function WorkspaceActionsSheet() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const theme = useTheme();
	const { workspace, host } = useWorkspaceHost(id ?? null);
	const changeset = useWorkspaceChangeset(id ?? null);
	const { projects } = useHostProjects(host);
	const { renameWorkspace, deleteWorkspace, shareWorkspace } =
		useWorkspaceHeaderActions(workspace, host);
	const pinned = usePinnedWorkspacesStore((state) =>
		id ? id in state.pinnedAt : false,
	);
	const togglePin = usePinnedWorkspacesStore((state) => state.togglePin);

	// A cloud workspace is served as `main` because its checkout is the repo,
	// but deleting it deletes the sandbox, not somebody's base checkout.
	const isCloud = host !== null && isSandboxHost(host.machineId);
	const canDelete = workspace ? workspace.type !== "main" || isCloud : false;
	const project = workspace?.projectId
		? projects.find((candidate) => candidate.id === workspace.projectId)
		: undefined;

	return (
		<>
			{/* The close button is a native bar item like every other sheet's:
			    pinned while the content scrolls under the transparent header,
			    and glass on the OS versions that draw it. */}
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel={t({
						message: "Close",
					})}
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="px-6 pb-10"
				contentInsetAdjustmentBehavior="automatic"
			>
				<Text
					className="mt-2 text-center text-xl font-semibold"
					numberOfLines={2}
				>
					{workspace?.name ?? ""}
				</Text>

				<View className="mt-5 flex-row justify-center gap-4">
					<CircleAction
						label={t({
							message: "Edit name",
						})}
						icon={<PencilIcon size={19} color={theme.foreground} />}
						onPress={() => void renameWorkspace()}
					/>
					<CircleAction
						label={pinned ? t({ message: "Unpin" }) : t({ message: "Pin" })}
						active={pinned}
						icon={
							<PinIcon
								size={19}
								color={pinned ? theme.background : theme.foreground}
							/>
						}
						onPress={() => id && togglePin(id)}
					/>
					<CircleAction
						label={t({ message: "Share" })}
						icon={<ShareIcon size={19} color={theme.foreground} />}
						onPress={shareWorkspace}
					/>
				</View>

				<Text className="text-muted-foreground mt-9 pb-1 text-[15px]">
					<Trans>Info</Trans>
				</Text>
				{workspace ? (
					<View className="border-border/60 flex-row items-center gap-3 border-b py-3.5">
						{project ? (
							<ProjectAvatar
								name={project.name}
								iconUrl={project.iconUrl}
								size={34}
							/>
						) : null}
						<View className="min-w-0 flex-1">
							{workspace.projectName ? (
								<Text className="text-[15px] font-medium" numberOfLines={1}>
									{workspace.projectName}
								</Text>
							) : null}
							<Text
								className="text-muted-foreground text-[13px]"
								numberOfLines={1}
							>
								{workspace.branch}
							</Text>
						</View>
					</View>
				) : null}
				{/* A sandbox isn't one of your machines; naming it as the host says
			    nothing the Cloud section didn't. */}
				{host && !isCloud ? (
					<InfoRow label={t({ message: "Host" })} value={host.name} />
				) : null}
				{changeset.files.length > 0 ? (
					<InfoRow
						label={t({
							message: "Changes",
						})}
						value={t({
							message: `+${changeset.additions} −${changeset.deletions} · ${plural(
								changeset.files.length,
								{ one: "# file", other: "# files" },
							)}`,
						})}
					/>
				) : null}
				{workspace ? (
					<InfoRow
						label={t({
							message: "Created",
						})}
						value={formatDistanceToNow(new Date(workspace.createdAt), {
							addSuffix: true,
						})}
						isLast
					/>
				) : null}

				{canDelete ? (
					<Pressable
						onPress={() => {
							router.back();
							deleteWorkspace();
						}}
						className="mt-8 flex-row items-center justify-center gap-2 py-3 active:opacity-60"
					>
						<Trash2Icon size={18} color={theme.destructive} />
						<Text className="text-destructive text-[15px] font-medium">
							<Trans>Delete workspace</Trans>
						</Text>
					</Pressable>
				) : null}
			</ScrollView>
		</>
	);
}
