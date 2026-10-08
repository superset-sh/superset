import { Trans } from "@lingui/react/macro";
import type { ApprovalRequest, Decision } from "@superset/chat/protocol";
import { ShieldQuestion } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const DETAIL_CHARS = 600;

function detailText(approval: ApprovalRequest): string {
	return (approval.detail ?? [])
		.map((content) =>
			content.type === "terminal"
				? `$ ${content.command}`
				: content.type === "diff"
					? `${content.path}\n${content.newText}`
					: content.text,
		)
		.join("\n");
}

function choices(
	approval: ApprovalRequest,
): { key: string; label: string | null; decision: Decision; deny: boolean }[] {
	const options = approval.options ?? [];
	if (options.length === 0) {
		return [
			{
				key: "decline",
				label: null,
				decision: { type: "decline" },
				deny: true,
			},
			{ key: "accept", label: null, decision: { type: "accept" }, deny: false },
		];
	}
	return options
		.map((option) => ({
			key: option.optionId,
			label: option.label,
			decision: { type: "option" as const, optionId: option.optionId },
			deny: option.kind?.startsWith("reject") ?? false,
		}))
		.sort((a, b) => Number(b.deny) - Number(a.deny));
}

export function ApprovalCard({
	approval,
	onRespond,
}: {
	approval: ApprovalRequest;
	onRespond: (approvalId: string, decision: Decision) => Promise<void>;
}) {
	const [sending, setSending] = useState(false);
	const [expanded, setExpanded] = useState(false);

	if (approval.status !== "pending") {
		return (
			<View className="flex-row items-center gap-1.5">
				<Icon as={ShieldQuestion} className="text-muted-foreground size-3" />
				<Text
					className="text-muted-foreground min-w-0 flex-1 text-xs"
					numberOfLines={1}
				>
					{approval.title}
				</Text>
			</View>
		);
	}

	const detail = detailText(approval);
	const long = detail.length > DETAIL_CHARS;
	const respond = (decision: Decision) => {
		setSending(true);
		void onRespond(approval.id, decision).finally(() => setSending(false));
	};

	return (
		<View className="w-full gap-3 rounded-xl border border-white/10 bg-[#1C1C1C] p-3">
			<View className="flex-row items-center gap-2">
				<Icon as={ShieldQuestion} className="text-muted-foreground size-4" />
				<Text className="text-foreground min-w-0 flex-1 text-[14px] font-medium">
					{approval.title}
				</Text>
			</View>
			{detail ? (
				<View className="gap-1.5 rounded-lg bg-black/40 px-3 py-2">
					<Text className="text-muted-foreground font-mono text-xs" selectable>
						{long && !expanded ? `${detail.slice(0, DETAIL_CHARS)}…` : detail}
					</Text>
					{long ? (
						<Pressable
							accessibilityRole="button"
							className="self-start active:opacity-60"
							hitSlop={8}
							onPress={() => setExpanded((open) => !open)}
						>
							<Text className="text-foreground text-xs font-medium">
								{expanded ? <Trans>Show less</Trans> : <Trans>Show more</Trans>}
							</Text>
						</Pressable>
					) : null}
				</View>
			) : null}
			<View className="flex-row flex-wrap justify-end gap-2">
				{choices(approval).map((choice) => (
					<Pressable
						accessibilityRole="button"
						className={cn(
							"rounded-md px-3 py-1.5 active:opacity-70",
							choice.deny ? "bg-white/10" : "bg-white",
							sending && "opacity-50",
						)}
						disabled={sending}
						key={choice.key}
						onPress={() => respond(choice.decision)}
					>
						<Text
							className={cn(
								"text-[13px] font-medium",
								choice.deny ? "text-foreground" : "text-black",
							)}
						>
							{choice.label ??
								(choice.deny ? <Trans>Deny</Trans> : <Trans>Allow</Trans>)}
						</Text>
					</Pressable>
				))}
			</View>
		</View>
	);
}
