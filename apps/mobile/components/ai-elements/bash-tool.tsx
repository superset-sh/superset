import { TerminalIcon } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ToolCallRow } from "./tool-call-row";

type BashToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

type BashToolProps = {
	command?: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	state: BashToolState;
	className?: string;
};

const MAX_OUTPUT_LINES = 20;

/** Extract first word of each command in a pipeline, max 4. */
function extractCommandSummary(command: string): string {
	const normalized = command.replace(/\\\s*\n\s*/g, " ");
	const parts = normalized.split(/\s*(?:&&|\|\||;|\|)\s*/);
	const firstWords = parts.map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
	const limited = firstWords.slice(0, 4);
	if (firstWords.length > 4) {
		return `${limited.join(", ")}...`;
	}
	return limited.join(", ");
}

const ClampedOutput = ({
	text,
	className,
}: {
	text: string;
	className?: string;
}) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const lineCount = text.trimEnd().split("\n").length;
	const isOverflowing = lineCount > MAX_OUTPUT_LINES;

	return (
		<View className="mt-1.5">
			<Text
				className={cn("font-mono text-xs", className)}
				numberOfLines={
					isOverflowing && !isExpanded ? MAX_OUTPUT_LINES : undefined
				}
			>
				{text}
			</Text>
			{isOverflowing ? (
				<Pressable
					accessibilityRole="button"
					hitSlop={8}
					onPress={() => setIsExpanded((prev) => !prev)}
				>
					<Text className="mt-1 text-muted-foreground text-xs underline">
						{isExpanded
							? "Show less"
							: `Show ${lineCount - MAX_OUTPUT_LINES} more lines`}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
};

export const BashTool = ({
	command,
	stdout,
	stderr,
	exitCode,
	state,
	className,
}: BashToolProps) => {
	const isPending = state === "input-streaming" || state === "input-available";
	const isError = exitCode !== undefined && exitCode !== 0;

	const commandSummary = useMemo(
		() => (command ? extractCommandSummary(command) : ""),
		[command],
	);

	const hasOutput = Boolean(command || stdout || stderr);

	return (
		<ToolCallRow
			className={className}
			description={commandSummary || undefined}
			icon={TerminalIcon}
			isError={isError}
			isPending={isPending}
			title="Bash"
		>
			{hasOutput ? (
				<View className="py-1.5 pl-2">
					{command ? (
						<Text className="font-mono text-xs">
							<Text className="font-mono text-amber-600 text-xs dark:text-amber-400">
								${" "}
							</Text>
							<Text className="font-mono text-foreground text-xs">
								{command}
							</Text>
						</Text>
					) : null}

					{stdout ? (
						<ClampedOutput className="text-muted-foreground" text={stdout} />
					) : null}

					{stderr ? (
						<ClampedOutput
							className={
								exitCode === 0 || exitCode === undefined
									? "text-amber-600 dark:text-amber-400"
									: "text-rose-500 dark:text-rose-400"
							}
							text={stderr}
						/>
					) : null}
				</View>
			) : undefined}
		</ToolCallRow>
	);
};
