import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { UseChatThreadResult } from "../../hooks/useChatThread";

function ActionButton({
	label,
	tone = "neutral",
	onPress,
}: {
	label: string;
	tone?: "primary" | "danger" | "neutral";
	onPress: () => void;
}) {
	const cls =
		tone === "primary"
			? "bg-primary"
			: tone === "danger"
				? "bg-destructive"
				: "bg-muted";
	const textCls =
		tone === "neutral" ? "text-foreground" : "text-primary-foreground";
	return (
		<Pressable
			className={`${cls} flex-1 items-center rounded-lg px-3 py-2`}
			onPress={onPress}
		>
			<Text className={`${textCls} font-medium`}>{label}</Text>
		</Pressable>
	);
}

function Card({
	title,
	detail,
	children,
}: {
	title: string;
	detail?: string;
	children: React.ReactNode;
}) {
	return (
		<View className="border-primary/40 bg-primary/5 mx-3 mb-2 gap-2 rounded-xl border p-3">
			<Text className="font-semibold">{title}</Text>
			{detail ? (
				<Text className="text-muted-foreground text-[13px]">{detail}</Text>
			) : null}
			{children}
		</View>
	);
}

/** Renders any pending interaction (tool approval, question, plan approval) with
 * actions that drive the runtime over the relay. Field access is defensive
 * because the concrete shapes come from the mastracode harness. */
export function ChatPendingActions({
	pendingApproval,
	pendingQuestion,
	pendingPlanApproval,
	respondToApproval,
	respondToQuestion,
	respondToPlan,
}: Pick<
	UseChatThreadResult,
	| "pendingApproval"
	| "pendingQuestion"
	| "pendingPlanApproval"
	| "respondToApproval"
	| "respondToQuestion"
	| "respondToPlan"
>) {
	const [answer, setAnswer] = useState("");

	if (pendingApproval) {
		const rec = pendingApproval as Record<string, unknown>;
		const toolName =
			(rec.toolName as string) ?? (rec.title as string) ?? "a tool";
		return (
			<Card
				title="Approval requested"
				detail={`The agent wants to run ${toolName}.`}
			>
				<View className="flex-row gap-2">
					<ActionButton
						label="Approve"
						tone="primary"
						onPress={() => respondToApproval("approve")}
					/>
					<ActionButton
						label="Decline"
						tone="danger"
						onPress={() => respondToApproval("decline")}
					/>
				</View>
				<ActionButton
					label="Always allow this kind"
					onPress={() => respondToApproval("always_allow_category")}
				/>
			</Card>
		);
	}

	if (pendingQuestion) {
		const rec = pendingQuestion as Record<string, unknown>;
		const questionId = String(rec.questionId ?? rec.id ?? "");
		const questionText =
			(rec.question as string) ??
			(rec.prompt as string) ??
			"The agent asked a question.";
		const options = Array.isArray(rec.options)
			? (rec.options as unknown[]).map(String)
			: [];
		return (
			<Card title="Question" detail={questionText}>
				{options.length > 0 ? (
					<View className="gap-2">
						{options.map((opt) => (
							<ActionButton
								key={opt}
								label={opt}
								onPress={() => respondToQuestion(questionId, opt)}
							/>
						))}
					</View>
				) : (
					<View className="gap-2">
						<View className="bg-card border-border rounded-lg border px-3 py-2">
							<TextInput
								className="text-foreground text-[15px]"
								value={answer}
								onChangeText={setAnswer}
								placeholder="Type your answer…"
								placeholderTextColor="#9ca3af"
								multiline
							/>
						</View>
						<ActionButton
							label="Send answer"
							tone="primary"
							onPress={() => {
								if (!answer.trim()) return;
								respondToQuestion(questionId, answer.trim());
								setAnswer("");
							}}
						/>
					</View>
				)}
			</Card>
		);
	}

	if (pendingPlanApproval) {
		const rec = pendingPlanApproval as Record<string, unknown>;
		const planId = String(rec.planId ?? rec.id ?? "");
		return (
			<Card
				title="Plan ready for review"
				detail="Approve the agent's plan to continue."
			>
				<View className="flex-row gap-2">
					<ActionButton
						label="Approve"
						tone="primary"
						onPress={() => respondToPlan(planId, "approved")}
					/>
					<ActionButton
						label="Reject"
						tone="danger"
						onPress={() => respondToPlan(planId, "rejected")}
					/>
				</View>
			</Card>
		);
	}

	return null;
}
