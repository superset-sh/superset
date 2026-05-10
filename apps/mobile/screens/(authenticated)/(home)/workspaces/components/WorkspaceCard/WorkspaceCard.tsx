import { Link } from "expo-router";
import { ChevronRight, GitBranch } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export interface WorkspaceCardProps {
	id: string;
	name: string;
	repoLabel?: string;
	branch?: string;
}

/**
 * Tap target is min 44pt high (Fitts's Law). Single-line truncation keeps
 * the card scannable (Aesthetic-Usability). Pressed state gives the
 * "pane opened" peak moment a clear acknowledgement.
 */
export function WorkspaceCard({
	id,
	name,
	repoLabel,
	branch,
}: WorkspaceCardProps) {
	return (
		<Link href={`/(authenticated)/(home)/workspaces/${id}`} asChild>
			<Pressable
				className="flex-row items-center gap-3 rounded-xl bg-card px-4 py-3 active:opacity-70"
				style={{ minHeight: 44 }}
			>
				<View className="flex-1 gap-0.5">
					<Text
						className="text-base font-semibold text-foreground"
						numberOfLines={1}
					>
						{name}
					</Text>
					{repoLabel || branch ? (
						<View className="flex-row items-center gap-1.5">
							{branch ? (
								<Icon
									as={GitBranch}
									className="text-muted-foreground size-3.5"
								/>
							) : null}
							<Text className="text-xs text-muted-foreground" numberOfLines={1}>
								{[repoLabel, branch].filter(Boolean).join(" · ")}
							</Text>
						</View>
					) : null}
				</View>
				<Icon as={ChevronRight} className="text-muted-foreground size-5" />
			</Pressable>
		</Link>
	);
}
