import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, View } from "react-native";
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

const SORT_OPTIONS: { value: WorkspaceSort; label: string }[] = [
	{ label: "Last updated", value: "updatedAt" },
	{ label: "Date created", value: "createdAt" },
];

export function WorkspaceFilterSheet({
	isPresented,
	onIsPresentedChange,
	projects,
	selectedProjectId,
	onSelectProject,
	sort,
	onChangeSort,
	width,
}: {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	projects: FilterableProject[];
	selectedProjectId: string | null;
	onSelectProject: (projectId: string) => void;
	sort: WorkspaceSort;
	onChangeSort: (sort: WorkspaceSort) => void;
	width: number;
}) {
	const theme = useTheme();

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={onIsPresentedChange}
				fitToContents
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDragIndicator("visible"),
						background(theme.background),
					]}
				>
					<RNHostView matchContents>
						<View className="px-5 pb-3 pt-6">
							<Text
								className="mb-2 text-sm font-semibold"
								style={{ color: theme.mutedForeground }}
							>
								Sort by
							</Text>
							{SORT_OPTIONS.map((option) => {
								const isActive = option.value === sort;
								return (
									<Pressable
										key={option.value}
										onPress={() => onChangeSort(option.value)}
										className="flex-row items-center gap-2.5 py-2.5"
									>
										<Text
											className="flex-1 text-sm font-medium"
											style={{ color: theme.foreground }}
										>
											{option.label}
										</Text>
										{isActive ? (
											<Ionicons
												name="checkmark-circle"
												size={18}
												color={theme.primary}
											/>
										) : null}
									</Pressable>
								);
							})}
							<Text
								className="mb-2 mt-4 text-sm font-semibold"
								style={{ color: theme.mutedForeground }}
							>
								Project
							</Text>
							<ScrollView style={{ maxHeight: 320 }}>
								{projects.map((project) => {
									const isActive = project.id === selectedProjectId;
									return (
										<Pressable
											key={project.id}
											onPress={() => onSelectProject(project.id)}
											className="flex-row items-center gap-2.5 py-2.5"
										>
											<ProjectAvatar
												name={project.name}
												iconUrl={project.iconUrl}
												size={28}
											/>
											<Text
												className="flex-1 text-sm font-medium"
												style={{ color: theme.foreground }}
												numberOfLines={1}
											>
												{project.name}
											</Text>
											<Text
												className="text-xs"
												style={{ color: theme.mutedForeground }}
											>
												{project.workspaceCount}
											</Text>
											{isActive ? (
												<Ionicons
													name="checkmark-circle"
													size={18}
													color={theme.primary}
												/>
											) : null}
										</Pressable>
									);
								})}
							</ScrollView>
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
