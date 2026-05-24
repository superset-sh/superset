import { useState } from "react";
import { ScrollView, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ModalHeader } from "@/components/ModalHeader";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type PlanReviewScreenProps = ViewProps & {
	planMarkdown: string;
	onReject: (feedback: string) => void;
	onApprove: () => void;
	onClose?: () => void;
	isSubmitting?: boolean;
	/** Pre-fill the feedback textarea (controlled). */
	feedback?: string;
	onFeedbackChange?: (next: string) => void;
};

/**
 * Full-screen plan review modal (UC-PAUSE-03 §A). Composes ModalHeader +
 * scrollable plan body + expandable feedback textarea + docked Reject/Approve
 * actions. The modal owns its chrome — there is no AppHeader / Composer
 * underneath while this organism is presented.
 *
 * Feedback is uncontrolled by default and surfaced only when the user expands
 * the textarea. When `feedback` / `onFeedbackChange` are passed, the textarea
 * becomes controlled.
 */
export function PlanReviewScreen({
	planMarkdown,
	onReject,
	onApprove,
	onClose,
	isSubmitting = false,
	feedback,
	onFeedbackChange,
	className,
	...props
}: PlanReviewScreenProps) {
	const insets = useSafeAreaInsets();
	const [internalFeedback, setInternalFeedback] = useState("");
	const [feedbackOpen, setFeedbackOpen] = useState(false);

	const isControlled = feedback !== undefined;
	const feedbackValue = isControlled ? feedback : internalFeedback;
	const setFeedback = (next: string) => {
		if (isControlled) onFeedbackChange?.(next);
		else setInternalFeedback(next);
	};

	return (
		<View
			className={cn("flex-1 bg-background", className)}
			style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
			{...props}
		>
			<ModalHeader title="Review plan" onClose={onClose} />
			<ScrollView
				className="flex-1 px-4"
				contentContainerStyle={{ paddingVertical: 16 }}
			>
				<Text className="font-mono text-foreground leading-6">
					{planMarkdown}
				</Text>
				<View className="h-3" />
				{feedbackOpen ? (
					<View className="gap-2">
						<Text
							variant="muted"
							className="text-xs font-mono uppercase tracking-wider"
						>
							Feedback for the assistant
						</Text>
						<Textarea
							value={feedbackValue}
							onChangeText={setFeedback}
							placeholder="Tell the assistant what to change…"
							multiline
							numberOfLines={4}
						/>
					</View>
				) : (
					<Button
						variant="ghost"
						onPress={() => setFeedbackOpen(true)}
						accessibilityLabel="Add feedback"
					>
						<Text>+ Add feedback</Text>
					</Button>
				)}
			</ScrollView>
			<View className="flex-row gap-2 px-4 pt-2 pb-3 border-t border-border bg-background">
				<Button
					variant="outline"
					className="flex-1"
					onPress={() => onReject(feedbackValue)}
					disabled={isSubmitting || feedbackValue.trim().length === 0}
				>
					<Text>Reject</Text>
				</Button>
				<Button
					variant="default"
					className="flex-1"
					onPress={onApprove}
					disabled={isSubmitting}
				>
					<Text>{isSubmitting ? "Working…" : "Approve"}</Text>
				</Button>
			</View>
		</View>
	);
}
