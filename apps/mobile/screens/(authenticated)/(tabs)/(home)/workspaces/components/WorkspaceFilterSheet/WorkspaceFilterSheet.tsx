import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	frame,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { ProjectAvatar } from "../ProjectAvatar";

export type WorkspaceSort = "updatedAt" | "createdAt";

export interface FilterableProject {
	id: string;
	name: string;
	iconUrl?: string | null;
	workspaceCount: number;
}

export interface FilterableHost {
	machineId: string;
	name: string;
	isOnline: boolean;
	workspaceCount: number;
}

const SORT_OPTIONS: { value: WorkspaceSort; label: string }[] = [
	{ label: "Last updated", value: "updatedAt" },
	{ label: "Date created", value: "createdAt" },
];

const ONLINE_COLOR = "#3fb950";

type FilterView = "root" | "sort" | "project" | "host";

function HostStatusDot({ isOnline }: { isOnline: boolean }) {
	const theme = useTheme();
	return (
		<View
			className="size-2 rounded-full"
			style={{
				backgroundColor: isOnline ? ONLINE_COLOR : theme.mutedForeground,
			}}
		/>
	);
}

function SheetHeader({
	title,
	onBack,
}: {
	title: string;
	onBack?: () => void;
}) {
	const theme = useTheme();
	return (
		<View className="mb-3 flex-row items-center gap-2">
			{onBack ? (
				<Pressable hitSlop={8} onPress={onBack} className="-ml-2 p-1">
					<Ionicons name="chevron-back" size={22} color={theme.foreground} />
				</Pressable>
			) : null}
			<Text
				className="text-xl font-semibold"
				style={{ color: theme.foreground }}
			>
				{title}
			</Text>
		</View>
	);
}

function SheetRow({
	icon,
	label,
	trailing,
	onPress,
	isLast,
}: {
	icon?: ReactNode;
	label: string;
	trailing: ReactNode;
	onPress: () => void;
	isLast?: boolean;
}) {
	const theme = useTheme();
	return (
		<>
			<Pressable onPress={onPress} className="flex-row items-center gap-3 py-4">
				{icon ? <View className="w-7 items-center">{icon}</View> : null}
				<Text className="text-base" style={{ color: theme.foreground }}>
					{label}
				</Text>
				<View className="flex-1 flex-row items-center justify-end gap-2">
					{trailing}
				</View>
			</Pressable>
			{isLast ? null : <Separator className={icon ? "ml-10" : undefined} />}
		</>
	);
}

function CheckMark({ visible }: { visible: boolean }) {
	const theme = useTheme();
	return visible ? (
		<Ionicons name="checkmark-circle" size={20} color={theme.primary} />
	) : null;
}

export function WorkspaceFilterSheet({
	isPresented,
	onIsPresentedChange,
	projects,
	selectedProjectId,
	onSelectProject,
	hosts,
	selectedHostId,
	onSelectHost,
	sort,
	onChangeSort,
	width,
}: {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	projects: FilterableProject[];
	selectedProjectId: string | null;
	onSelectProject: (projectId: string) => void;
	hosts: FilterableHost[];
	selectedHostId: string | null;
	onSelectHost: (machineId: string | null) => void;
	sort: WorkspaceSort;
	onChangeSort: (sort: WorkspaceSort) => void;
	width: number;
}) {
	const theme = useTheme();
	const [view, setView] = useState<FilterView>("root");

	useEffect(() => {
		if (isPresented) setView("root");
	}, [isPresented]);

	const selectedProject = projects.find(
		(project) => project.id === selectedProjectId,
	);
	const selectedHost = hosts.find((host) => host.machineId === selectedHostId);
	const sortLabel =
		SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";

	const mutedIcon = (name: keyof typeof Ionicons.glyphMap) => (
		<Ionicons name={name} size={20} color={theme.mutedForeground} />
	);

	const trailingValue = (value: string, accessory?: ReactNode) => (
		<>
			{accessory}
			<Text
				className="flex-shrink text-base"
				style={{ color: theme.mutedForeground }}
				numberOfLines={1}
			>
				{value}
			</Text>
			<Ionicons
				name="chevron-forward"
				size={18}
				color={theme.mutedForeground}
			/>
		</>
	);

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={onIsPresentedChange}
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDetents(["large"]),
						presentationDragIndicator("visible"),
						frame({ maxHeight: 10_000, alignment: "top" }),
						background(theme.background),
					]}
				>
					<RNHostView matchContents>
						<View className="px-6 pb-8 pt-6">
							{view === "root" ? (
								<>
									<SheetHeader title="Filter" />
									<SheetRow
										icon={mutedIcon("folder-outline")}
										label="Project"
										trailing={trailingValue(
											selectedProject?.name ?? "All",
											selectedProject ? (
												<ProjectAvatar
													name={selectedProject.name}
													iconUrl={selectedProject.iconUrl}
													size={22}
												/>
											) : undefined,
										)}
										onPress={() => setView("project")}
									/>
									<SheetRow
										icon={mutedIcon("desktop-outline")}
										label="Host"
										trailing={trailingValue(
											selectedHost?.name ?? "All hosts",
											selectedHost ? (
												<HostStatusDot isOnline={selectedHost.isOnline} />
											) : undefined,
										)}
										onPress={() => setView("host")}
									/>
									<SheetRow
										icon={mutedIcon("swap-vertical")}
										label="Sort"
										trailing={trailingValue(sortLabel)}
										onPress={() => setView("sort")}
										isLast
									/>
								</>
							) : null}
							{view === "sort" ? (
								<>
									<SheetHeader title="Sort" onBack={() => setView("root")} />
									{SORT_OPTIONS.map((option, index) => (
										<SheetRow
											key={option.value}
											label={option.label}
											trailing={<CheckMark visible={option.value === sort} />}
											onPress={() => {
												onChangeSort(option.value);
												setView("root");
											}}
											isLast={index === SORT_OPTIONS.length - 1}
										/>
									))}
								</>
							) : null}
							{view === "project" ? (
								<>
									<SheetHeader title="Project" onBack={() => setView("root")} />
									<ScrollView style={{ maxHeight: 640 }}>
										{projects.map((project, index) => (
											<SheetRow
												key={project.id}
												icon={
													<ProjectAvatar
														name={project.name}
														iconUrl={project.iconUrl}
														size={28}
													/>
												}
												label={project.name}
												trailing={
													<>
														<Text
															className="text-sm"
															style={{ color: theme.mutedForeground }}
														>
															{project.workspaceCount}
														</Text>
														<CheckMark
															visible={project.id === selectedProjectId}
														/>
													</>
												}
												onPress={() => {
													onSelectProject(project.id);
													setView("root");
												}}
												isLast={index === projects.length - 1}
											/>
										))}
									</ScrollView>
								</>
							) : null}
							{view === "host" ? (
								<>
									<SheetHeader title="Host" onBack={() => setView("root")} />
									<ScrollView style={{ maxHeight: 640 }}>
										<SheetRow
											label="All hosts"
											trailing={<CheckMark visible={selectedHostId === null} />}
											onPress={() => {
												onSelectHost(null);
												setView("root");
											}}
										/>
										{hosts.map((host, index) => (
											<SheetRow
												key={host.machineId}
												icon={<HostStatusDot isOnline={host.isOnline} />}
												label={host.name}
												trailing={
													<>
														<Text
															className="text-sm"
															style={{ color: theme.mutedForeground }}
														>
															{host.workspaceCount}
														</Text>
														<CheckMark
															visible={host.machineId === selectedHostId}
														/>
													</>
												}
												onPress={() => {
													onSelectHost(host.machineId);
													setView("root");
												}}
												isLast={index === hosts.length - 1}
											/>
										))}
									</ScrollView>
								</>
							) : null}
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
