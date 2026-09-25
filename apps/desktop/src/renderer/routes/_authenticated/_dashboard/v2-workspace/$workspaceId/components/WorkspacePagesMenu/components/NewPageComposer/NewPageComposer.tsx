import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuArrowUp, LuLoaderCircle } from "react-icons/lu";
import { useSendToTerminalAgent } from "renderer/hooks/host-service/useSendToTerminalAgent";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { buildPageAgentPrompt } from "renderer/routes/_authenticated/_dashboard/utils/pageAgentPrompt";
import type { CreateNewAgentSession } from "../../../../hooks/useAgentSessionLauncher";
import {
	AgentPickerSelect,
	useDiffCommentTarget,
} from "../../../../hooks/usePaneRegistry/components/AgentCommentComposer";

interface NewPageComposerProps {
	workspaceId: string;
	onSent: () => void;
	onCreateNewAgentSession: CreateNewAgentSession;
	onFocusAgentTerminal: (terminalId: string) => void;
}

export function NewPageComposer({
	workspaceId,
	onSent,
	onCreateNewAgentSession,
	onFocusAgentTerminal,
}: NewPageComposerProps) {
	const { t } = useLingui();
	const { send: sendToTerminalAgent } = useSendToTerminalAgent();

	const bindings = useTerminalAgentBindings(workspaceId);
	const sessions = useMemo(
		() =>
			Array.from(bindings.values()).sort(
				(a, b) => b.lastEventAt - a.lastEventAt,
			),
		[bindings],
	);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const { value, resolved, onValueChange } = useDiffCommentTarget({
		sessions,
		configs,
	});

	const [request, setRequest] = useState(() =>
		t({ message: "Summarize the changes in this workspace" }),
	);
	const [submitting, setSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		textareaRef.current?.focus();
		textareaRef.current?.select();
	}, []);

	const canSubmit =
		request.trim().length > 0 && !submitting && resolved != null;

	const handleSubmit = async () => {
		if (!canSubmit || !resolved) return;
		setSubmitting(true);
		try {
			const prompt = buildPageAgentPrompt(request);
			if (resolved.kind === "new") {
				const result = await onCreateNewAgentSession({
					configId: resolved.configId,
					placement: resolved.placement,
					prompt,
				});
				if (result) {
					onFocusAgentTerminal(result.terminalId);
					onSent();
				}
				return;
			}
			try {
				await sendToTerminalAgent({
					workspaceId,
					terminalId: resolved.terminalId,
					text: prompt,
				});
				toast.success(t({ message: "Sent to agent" }));
				onFocusAgentTerminal(resolved.terminalId);
				onSent();
			} catch {
				// Toast surfaced by the hook; keep the composer open for retry.
			}
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void handleSubmit();
			}}
			onKeyDown={(event) => {
				// isComposing: Enter that commits an IME candidate must not send.
				if (
					event.key === "Enter" &&
					!event.shiftKey &&
					!event.nativeEvent.isComposing &&
					canSubmit
				) {
					event.preventDefault();
					void handleSubmit();
				}
			}}
		>
			<textarea
				ref={textareaRef}
				value={request}
				onChange={(event) => setRequest(event.target.value)}
				placeholder={t({ message: "What should the page show?" })}
				aria-label={t({ message: "What should the page show?" })}
				rows={3}
				className="block w-full resize-none bg-transparent px-2.5 pt-2 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
			/>
			<div className="flex items-center gap-1.5 px-1.5 pb-1.5 pt-1">
				<AgentPickerSelect
					value={value}
					onValueChange={onValueChange}
					sessions={sessions}
					configs={configs}
				/>
				<button
					type="submit"
					disabled={!canSubmit}
					aria-label={t({ message: "Send to agent" })}
					className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-35"
				>
					{submitting ? (
						<LuLoaderCircle className="size-3.5 animate-spin" />
					) : (
						<LuArrowUp className="size-3.5" strokeWidth={2.5} />
					)}
				</button>
			</div>
		</form>
	);
}
