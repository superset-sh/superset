import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { CodeBlockContent } from "@/components/ai-elements/code-block";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import type { ChangesetSource } from "../hooks/useWorkspaceChangeset";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	tsx: "tsx",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "tsx",
	json: "json",
	jsonc: "json",
	md: "markdown",
	mdx: "markdown",
	py: "python",
	rs: "rust",
	go: "go",
	css: "css",
	html: "html",
	yml: "yaml",
	yaml: "yaml",
	sql: "sql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	diff: "diff",
};

function languageForPath(path: string): string {
	const extension = path.split(".").pop()?.toLowerCase() ?? "";
	return LANGUAGE_BY_EXTENSION[extension] ?? "text";
}

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

	return (
		<>
			<Stack.Screen options={{ title: fileName }} />
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon="doc.on.doc"
					accessibilityLabel="Copy path"
					onPress={() => void Clipboard.setStringAsync(path ?? "")}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: 48 }}
			>
				<Text className="text-muted-foreground px-4 pb-2 pt-1 text-xs">
					{path}
				</Text>
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
