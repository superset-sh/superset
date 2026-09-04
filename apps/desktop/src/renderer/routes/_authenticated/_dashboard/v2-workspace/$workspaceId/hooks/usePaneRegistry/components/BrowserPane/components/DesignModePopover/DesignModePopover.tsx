import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { SquareDashedMousePointer, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuArrowUp, LuLoaderCircle } from "react-icons/lu";
import { useSendToTerminalAgent } from "renderer/hooks/host-service/useSendToTerminalAgent";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { DesignModePayload } from "shared/browser-design-mode";
import {
	AgentPickerSelect,
	useDiffCommentTarget,
} from "../../../AgentCommentComposer";
import {
	buildDesignModePrompt,
	shortDesignModeElementLabel,
} from "../../designModePrompt";
import { writeDesignModeAttachments } from "../../writeDesignModeAttachments";

interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
}

interface DesignModePopoverProps {
	workspaceId: string;
	/** Browser pane the element was picked in, for the live-verify hints. */
	paneId: string;
	payload: DesignModePayload;
	/** Anchoring computed by the pane (under the clicked element). */
	style: React.CSSProperties;
	/** Discard this capture and go back to picking. */
	onDismiss: () => void;
	/** Called after the prompt was delivered to an agent. */
	onSent: () => void;
	onCreateNewAgentSession?: (
		input: CreateNewAgentSessionInput,
	) => Promise<{ terminalId: string } | null>;
	/** Bring the pane hosting this agent terminal to the front. */
	onFocusAgentTerminal?: (terminalId: string) => void;
}

const TEXTAREA_MAX_HEIGHT = 120;

/**
 * Cursor-style prompt card anchored under the element the user just clicked:
 * an element chip inline with the prompt text, and one footer row with the
 * re-pick pill, the agent picker, and a round send button. The page stays
 * visible with the frozen picker highlight. New-session sends reuse the
 * last-remembered placement rather than surfacing the toggle here.
 */
export function DesignModePopover({
	workspaceId,
	paneId,
	payload,
	style,
	onDismiss,
	onSent,
	onCreateNewAgentSession,
	onFocusAgentTerminal,
}: DesignModePopoverProps) {
	const { t } = useLingui();
	const { send: sendToTerminalAgent } = useSendToTerminalAgent();
	const workspaceClient = workspaceTrpc.useUtils().client;

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

	const [comment, setComment] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	const autoGrow = () => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
	};

	const canSubmit =
		comment.trim().length > 0 && !submitting && resolved != null;

	const handleSubmit = async () => {
		if (!canSubmit || !resolved) return;
		setSubmitting(true);
		try {
			let prompt: string;
			try {
				const { contextPath, screenshotPath } =
					await writeDesignModeAttachments({
						client: workspaceClient,
						workspaceId,
						paneId,
						payload,
						comment: comment.trim(),
					});
				prompt = buildDesignModePrompt({
					payload,
					comment: comment.trim(),
					contextPath,
					screenshotPath,
				});
			} catch (error) {
				toast.error(
					t({
						message: "Couldn't stage design feedback",
					}),
					{
						description: error instanceof Error ? error.message : undefined,
					},
				);
				return;
			}

			if (resolved.kind === "new") {
				if (!onCreateNewAgentSession) {
					toast.error(
						t({
							message: "Couldn't start a new agent session",
						}),
					);
					return;
				}
				const result = await onCreateNewAgentSession({
					configId: resolved.configId,
					placement: resolved.placement,
					prompt,
				});
				if (result) {
					onFocusAgentTerminal?.(result.terminalId);
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
				toast.success(
					t({
						message: "Sent to agent",
					}),
				);
				onFocusAgentTerminal?.(resolved.terminalId);
				onSent();
			} catch {
				// Toast surfaced by the hook; keep the popover open for retry.
			}
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="absolute z-20" style={style}>
			<form
				className="overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25),0_2px_4px_-2px_rgba(0,0,0,0.12)]"
				onSubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.stopPropagation();
						onDismiss();
					}
					// isComposing: Enter that commits an IME candidate must not send.
					if (
						e.key === "Enter" &&
						!e.shiftKey &&
						!e.nativeEvent.isComposing &&
						canSubmit
					) {
						e.preventDefault();
						handleSubmit();
					}
				}}
			>
				<div className="flex flex-wrap items-start gap-x-1.5 gap-y-1 px-3 pt-2.5 pb-1">
					<span className="inline-flex max-w-56 shrink-0 items-center gap-1 pt-px text-[13px] font-medium text-[#0d99ff]">
						<SquareDashedMousePointer className="size-3.5 shrink-0" />
						<span className="truncate">
							{shortDesignModeElementLabel(payload)}
						</span>
					</span>
					<textarea
						ref={textareaRef}
						value={comment}
						onChange={(e) => {
							setComment(e.target.value);
							autoGrow();
						}}
						placeholder={t({
							message: "Describe the change…",
						})}
						rows={1}
						className="block min-w-[140px] flex-1 resize-none bg-transparent text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
					/>
				</div>

				<div className="flex items-center gap-1.5 px-2.5 pb-2 pt-1">
					<Tooltip disableHoverableContent>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onDismiss}
								aria-label={t({
									message: "Pick a different element",
								})}
								className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border border-border/60 px-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
							>
								<SquareDashedMousePointer className="size-3" />
								<XIcon className="size-3" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>Pick a different element (esc)</Trans>
						</TooltipContent>
					</Tooltip>
					<AgentPickerSelect
						value={value}
						onValueChange={onValueChange}
						sessions={sessions}
						configs={configs}
					/>
					<button
						type="submit"
						disabled={!canSubmit}
						aria-label={t({
							message: "Send to agent",
						})}
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
		</div>
	);
}
