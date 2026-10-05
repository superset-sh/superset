import { Trans } from "@lingui/react/macro";
import type { ApprovalRequest, Decision } from "@superset/chat/protocol";
import { ShieldQuestion } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const DETAIL_CHARS = 600;

function detailText(approval: ApprovalRequest): string {
	const text = (approval.detail ?? [])
		.map((content) =>
			content.type === "terminal"
				? `$ ${content.command}`
				: content.type === "diff"
					? content.path
					: content.text,
		)
		.join("\n");
	return text.length > DETAIL_CHARS ? `${text.slice(0, DETAIL_CHARS)}…` : text;
}

/** Deny first: on a phone the thumb lands on the first button. */
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
	const respond = (decision: Decision) => {
		setSending(true);
		void onRespond(approval.id, decision).finally(() => setSending(false));
	};

	return (
		<View className="border-border bg-card gap-3 rounded-lg border p-3">
			<View className="flex-row items-center gap-2">
				<Icon as={ShieldQuestion} className="text-foreground size-4" />
				<Text className="text-foreground min-w-0 flex-1 text-sm font-medium">
					{approval.title}
				</Text>
			</View>
			{detail ? (
				<Text className="text-muted-foreground font-mono text-xs" selectable>
					{detail}
				</Text>
			) : null}
			<View className="flex-row flex-wrap gap-2">
				{choices(approval).map((choice) => (
					<Button
						disabled={sending}
						key={choice.key}
						onPress={() => respond(choice.decision)}
						size="sm"
						variant={choice.deny ? "outline" : "default"}
					>
						<Text>
							{choice.label ??
								(choice.deny ? <Trans>Deny</Trans> : <Trans>Allow</Trans>)}
						</Text>
					</Button>
				))}
			</View>
		</View>
	);
}
