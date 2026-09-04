import { Trans, useLingui } from "@lingui/react/macro";
import type { UserContent } from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { Composer } from "../Composer";

export const HARNESSES = ["claude-code", "codex"] as const;
export type HarnessId = (typeof HARNESSES)[number];

export function NewSessionView({
	harness,
	headerLeft,
	onHarnessChange,
	onSend,
	workspaceId,
}: {
	workspaceId: string;
	harness: HarnessId;
	onHarnessChange: (harness: HarnessId) => void;
	onSend: (content: UserContent[]) => void;
	headerLeft?: ReactNode;
}) {
	const { t } = useLingui();
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center gap-2 border-b border-border px-3 py-2">
				{headerLeft}
				<div className="ml-auto flex items-center gap-1">
					{HARNESSES.map((candidate) => (
						<Button
							key={candidate}
							onClick={() => onHarnessChange(candidate)}
							size="sm"
							variant={candidate === harness ? "secondary" : "ghost"}
						>
							{candidate}
						</Button>
					))}
				</div>
			</div>
			<div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
				<span className="text-sm font-medium">
					<Trans>New chat</Trans>
				</span>
				<span className="text-xs text-muted-foreground">
					<Trans>Send a message to start a {harness} session</Trans>
				</span>
			</div>
			<Composer
				draftKey={`chat-v3-draft:new:${workspaceId}`}
				onSend={(content) => {
					onSend(content);
					return null;
				}}
				outbox={[]}
				placeholder={t({
					message: `Start a ${harness} session`,
				})}
			/>
		</div>
	);
}
