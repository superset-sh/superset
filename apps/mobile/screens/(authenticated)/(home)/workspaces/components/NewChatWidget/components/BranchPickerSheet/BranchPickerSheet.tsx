import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationBackground,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { SheetCloseButton } from "@/screens/(authenticated)/(home)/components/SheetCloseButton";
import { hslToHex } from "../../../../utils/hslToHex";

// RNHostView sizes to its RN content, so the full-height sheet needs an
// explicit content height; the large detent is roughly the screen minus
// the top inset.
const LARGE_DETENT_FRACTION = 0.88;

function BranchRow({
	name,
	isSelected,
	onPress,
}: {
	name: string;
	isSelected: boolean;
	onPress: () => void;
}) {
	const theme = useTheme();
	return (
		<Pressable className="flex-row items-center gap-2 py-2.5" onPress={onPress}>
			<Text
				className="flex-1 text-sm"
				numberOfLines={1}
				style={{ color: theme.foreground }}
			>
				{name}
			</Text>
			{isSelected ? (
				<Ionicons name="checkmark-circle" size={18} color={theme.primary} />
			) : null}
		</Pressable>
	);
}

export function BranchPickerSheet({
	isPresented,
	onIsPresentedChange,
	hostUrl,
	projectId,
	selectedBranch,
	onSelect,
}: {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	hostUrl: string | null;
	projectId: string | null;
	/** Null = default branch. */
	selectedBranch: string | null;
	onSelect: (branch: string | null) => void;
}) {
	const theme = useTheme();
	const { width, height } = useWindowDimensions();
	const [query, setQuery] = useState("");

	const trimmedQuery = query.trim();
	const { data, isLoading } = useQuery({
		queryKey: ["host-service", "branches", hostUrl, projectId, trimmedQuery],
		enabled: isPresented && hostUrl !== null && projectId !== null,
		placeholderData: (previous) => previous,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl || !projectId) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).workspaceCreation.searchBranches.query({
				projectId,
				query: trimmedQuery || undefined,
				limit: 50,
				refresh: trimmedQuery === "",
			});
		},
	});

	const defaultBranch = data?.defaultBranch ?? null;
	const branches = useMemo(
		() => (data?.items ?? []).filter((branch) => branch.name !== defaultBranch),
		[data, defaultBranch],
	);

	const handlePresentedChange = (value: boolean) => {
		if (!value) setQuery("");
		onIsPresentedChange(value);
	};

	const selectAndClose = (branch: string | null) => {
		onSelect(branch);
		handlePresentedChange(false);
	};

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={handlePresentedChange}
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDetents(["large"]),
						presentationDragIndicator("visible"),
						background(theme.background),
						presentationBackground(hslToHex(theme.background)),
					]}
				>
					<RNHostView matchContents>
						<View
							className="px-5 pb-6 pt-5"
							style={{ height: height * LARGE_DETENT_FRACTION }}
						>
							<View className="relative mb-3 items-center justify-center">
								<View className="absolute left-0">
									<SheetCloseButton
										onPress={() => handlePresentedChange(false)}
									/>
								</View>
								<Text
									className="text-center text-lg font-semibold"
									style={{ color: theme.foreground }}
								>
									Branch
								</Text>
							</View>
							<View className="relative justify-center">
								<View className="absolute left-3 z-10">
									<Ionicons
										name="search"
										size={16}
										color={theme.mutedForeground}
									/>
								</View>
								<Input
									autoCapitalize="none"
									autoCorrect={false}
									className="rounded-full pl-9"
									onChangeText={setQuery}
									placeholder="Branches..."
									value={query}
								/>
							</View>
							<ScrollView
								style={{ flex: 1 }}
								contentContainerStyle={{ flexGrow: 1 }}
								keyboardShouldPersistTaps="handled"
							>
								{defaultBranch ? (
									<>
										<Text
											className="pb-1 pt-3 text-sm font-semibold"
											style={{ color: theme.mutedForeground }}
										>
											Default
										</Text>
										<BranchRow
											name={defaultBranch}
											isSelected={
												selectedBranch === null ||
												selectedBranch === defaultBranch
											}
											onPress={() => selectAndClose(null)}
										/>
									</>
								) : null}
								{branches.length > 0 ? (
									<Text
										className="pb-1 pt-3 text-sm font-semibold"
										style={{ color: theme.mutedForeground }}
									>
										{trimmedQuery ? "Branches" : "Recents"}
									</Text>
								) : null}
								{branches.map((branch) => (
									<BranchRow
										key={branch.name}
										name={branch.name}
										isSelected={selectedBranch === branch.name}
										onPress={() => selectAndClose(branch.name)}
									/>
								))}
								{isLoading && !data ? (
									<View className="items-center py-6">
										<Spinner size="small" />
									</View>
								) : null}
								{!isLoading && !defaultBranch && branches.length === 0 ? (
									<Text
										className="py-6 text-center text-sm"
										style={{ color: theme.mutedForeground }}
									>
										No branches found
									</Text>
								) : null}
							</ScrollView>
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
