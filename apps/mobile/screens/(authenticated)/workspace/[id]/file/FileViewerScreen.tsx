import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, Share, View } from "react-native";
import { CodeBlockContent } from "@/components/ai-elements/code-block";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import type { ChangesetSource } from "../hooks/useWorkspaceChangeset";
import { languageForPath } from "../utils/languageForPath";

export function FileViewerScreen() {
	const { id, path, source } = useLocalSearchParams<{
		id: string;
		path: string;
		source?: string;
	}>();
	const { host } = useWorkspaceHost(id ?? null);
	const hostUrl =
		host?.isOnline === true
			? buildRelayHostUrl(host.organizationId, host.machineId)
			: null;

	const category = (source ?? "unstaged") as ChangesetSource;

	const query = useQuery({
		// Distinct from the files-changed screen's diff-row cache: same procedure,
		// different cached shape (raw file pair vs computed rows).
		queryKey: ["workspace-file-contents", id ?? null, category, path] as const,
		enabled: hostUrl !== null && !!id && !!path,
		staleTime: 15_000,
		retry: 1,
		networkMode: "always" as const,
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl as string).git.getDiff.query({
				workspaceId: id as string,
				path: path as string,
				category,
			}),
	});

	const contents = query.data?.newFile.contents ?? "";
	const fileName = path?.split("/").pop() ?? "File";
	const directory = path?.includes("/")
		? path.slice(0, path.lastIndexOf("/"))
		: null;

	return (
		<>
			<Stack.Screen options={{ title: fileName }}>
				<Stack.Title asChild>
					<View className="max-w-72 items-center">
						<Text className="font-semibold text-[15px]" numberOfLines={1}>
							{fileName}
						</Text>
						{directory ? (
							<Text
								className="text-muted-foreground text-[10.5px]"
								numberOfLines={1}
							>
								{directory}
							</Text>
						) : null}
					</View>
				</Stack.Title>
				<Stack.Toolbar placement="right">
					<Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="File actions">
						<Stack.Toolbar.MenuAction
							icon="doc.on.doc"
							onPress={() => void Clipboard.setStringAsync(path ?? "")}
						>
							Copy relative path
						</Stack.Toolbar.MenuAction>
						<Stack.Toolbar.MenuAction
							icon="doc.on.doc"
							onPress={() => void Clipboard.setStringAsync(fileName)}
						>
							Copy file name
						</Stack.Toolbar.MenuAction>
						<Stack.Toolbar.MenuAction
							icon="square.and.arrow.up"
							onPress={() => void Share.share({ message: contents })}
						>
							Share via…
						</Stack.Toolbar.MenuAction>
					</Stack.Toolbar.Menu>
				</Stack.Toolbar>
			</Stack.Screen>
			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: 48 }}
			>
				{query.isLoading ? (
					<View className="items-center py-20">
						<ActivityIndicator />
					</View>
				) : query.isError ? (
					<View className="items-center px-10 py-20">
						<Text className="text-muted-foreground text-center text-sm">
							Could not load this file.
						</Text>
					</View>
				) : contents.length === 0 ? (
					<View className="items-center px-10 py-20">
						<Text className="text-muted-foreground text-center text-sm">
							This file is empty or was deleted.
						</Text>
					</View>
				) : (
					<CodeBlockContent
						code={contents}
						language={languageForPath(path ?? "")}
						showLineNumbers
					/>
				)}
			</ScrollView>
		</>
	);
}
