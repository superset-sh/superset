import { useState } from "react";
import { View } from "react-native";
import { CodeBlock } from "@/components/CodeBlock";
import { Text } from "@/components/ui/text";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_MARKDOWN,
} from "../../mock-data";
import type { ChatThreadItem } from "../../types";

const TRPC_SNIPPET = `export const billingRouter = router({
  charge: protectedProcedure
    .input(z.object({ amount: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return chargeCustomer(ctx, input);
    }),
});`;

export type ChatViewMarkdownProps = Pick<ChatViewProps, "className">;

/**
 * UC-RENDER-03 §A — markdown rendering with a code block (Copy + language
 * label) and inline `<code>` styling. Composes the existing CodeBlock molecule
 * inline beneath the assistant body so callers can see the full layout.
 */
export function ChatViewMarkdown({ className }: ChatViewMarkdownProps) {
	const [copied, setCopied] = useState<string | null>(null);
	const items: ChatThreadItem[] = [
		...MOCK_THREAD_MARKDOWN,
		{
			id: "a-md-code",
			kind: "assistant-body",
			body: (
				<View className="gap-2">
					<CodeBlock
						code={TRPC_SNIPPET}
						language="ts"
						onCopy={(c) => setCopied(c.slice(0, 24))}
					/>
					{copied ? (
						<Text variant="muted" className="text-xs font-mono">
							Copied "{copied}…"
						</Text>
					) : null}
				</View>
			),
		},
	];

	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "live", statusLabel: "Done" }}
			items={items}
			composer={{
				state: "idle",
				rowProps: {
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}
