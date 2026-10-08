import { useLingui } from "@lingui/react/macro";
import { Check, X } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import type { ToolActivityStatus } from "@/lib/voice/voiceStore";
import { WaveSpinner } from "@/screens/(authenticated)/components/WaveSpinner";

function useToolLabel(name: string, subject: string | null): string {
	const { t } = useLingui();
	const what = subject ?? "";
	switch (name) {
		case "list_workspaces":
			return t({ message: "Checking workspaces" });
		case "get_workspace":
			return subject
				? t({ message: `Looking at ${what}` })
				: t({ message: "Looking up a workspace" });
		case "list_sessions":
			return t({ message: `Listing sessions in ${what}` });
		case "read_session":
			return t({ message: `Reading ${what}` });
		case "list_pull_requests":
			return t({ message: `Checking pull requests in ${what}` });
		case "list_pages":
			return t({ message: "Looking for pages" });
		case "open_page":
		case "show":
			return t({ message: `Opening ${what}` });
		case "send_message":
			return t({ message: `Sending a message to ${what}` });
		case "restart_workspace":
			return t({ message: `Restarting ${what}` });
		case "read_page":
			return t({ message: "Reading the page" });
		case "create_workspace":
			return t({ message: "Creating a workspace" });
		case "start_agent":
			return t({ message: `Starting an agent in ${what}` });
		case "stop_agent":
			return t({ message: `Stopping the agent in ${what}` });
		case "create_task":
			return t({ message: "Creating a task" });
		case "list_tasks":
			return t({ message: "Looking at tasks" });
		case "end_session":
			return t({ message: "Ending the call" });
		default:
			return name;
	}
}

/** One function call in the transcript: what it is doing, then whether it worked. */
export function ToolActivityRow({
	name,
	subject,
	status,
}: {
	name: string;
	subject: string | null;
	status: ToolActivityStatus;
}) {
	const label = useToolLabel(name, subject);
	const theme = useTheme();
	return (
		<View className="bg-secondary/70 flex-row items-center gap-2 self-start rounded-full py-1.5 pl-2.5 pr-3">
			{status === "running" ? (
				<WaveSpinner color={theme.mutedForeground} />
			) : status === "done" ? (
				<Icon as={Check} className="text-muted-foreground size-3.5" />
			) : (
				<Icon as={X} className="text-destructive size-3.5" />
			)}
			<Text className="text-muted-foreground text-[13px]">{label}</Text>
		</View>
	);
}
