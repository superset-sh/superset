import { Pressable, View } from "react-native";
import { Banner, type BannerVariant } from "@/components/Banner";
import { Text } from "@/components/ui/text";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";

export type ChatViewDispatchOutcomesProps = Pick<ChatViewProps, "className"> & {
	variant?: "stacked" | BannerVariant;
};

const VARIANT_HEADLINE: Record<BannerVariant, string> = {
	offline: "Host offline · retry to reconnect",
	unpaid: "Host plan required",
	"dispatch-failed": "Dispatch failed · retry",
	"permission-denied": "Push notifications disabled",
};

const VARIANT_BODY: Record<BannerVariant, string> = {
	offline: "Messages won't send until the host comes back online.",
	unpaid: "Upgrade the host plan to dispatch more sessions.",
	"dispatch-failed": "We couldn't reach the host. Try sending again.",
	"permission-denied": "Re-enable notifications in iOS Settings.",
};

/**
 * UC-PLATF-03 §B — banner variants for dispatch outcomes. Default story
 * stacks `unpaid` and `dispatch-failed` to mirror the contact-sheet design;
 * named stories isolate each variant for review.
 */
export function ChatViewDispatchOutcomes({
	variant = "stacked",
	className,
}: ChatViewDispatchOutcomesProps) {
	const banner =
		variant === "stacked" ? (
			<View>
				<Banner
					variant="unpaid"
					headline={VARIANT_HEADLINE.unpaid}
					body={VARIANT_BODY.unpaid}
					cta={
						<Pressable accessibilityRole="button">
							<Text className="text-state-danger-fg font-semibold underline">
								Upgrade
							</Text>
						</Pressable>
					}
				/>
				<Banner
					variant="dispatch-failed"
					headline={VARIANT_HEADLINE["dispatch-failed"]}
					body={VARIANT_BODY["dispatch-failed"]}
					cta={
						<Pressable accessibilityRole="button">
							<Text className="text-state-danger-fg font-semibold underline">
								Retry
							</Text>
						</Pressable>
					}
				/>
			</View>
		) : (
			<Banner
				variant={variant}
				headline={VARIANT_HEADLINE[variant]}
				body={VARIANT_BODY[variant]}
			/>
		);

	return (
		<ChatView
			className={className}
			header={{
				...MOCK_HEADER,
				status: "offline",
				statusLabel: "Dispatch error",
				banner,
			}}
			items={MOCK_THREAD_STREAMING}
			composer={{
				state: "disabled",
				rowProps: {
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}
