import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuCornerDownLeft, LuLoaderCircle } from "react-icons/lu";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { AgentPickerSelect } from "./components/AgentPickerSelect";
import { AgentPlacementToggle } from "./components/AgentPlacementToggle";
import {
	type AgentTarget,
	useDiffCommentTarget,
} from "./hooks/useDiffCommentTarget";

export type {
	AgentSessionPlacement,
	AgentTarget,
} from "./hooks/useDiffCommentTarget";

interface AgentCommentComposerProps {
	workspaceId: string;
	startLine: number;
	endLine: number;
	onCancel: () => void;
	onSubmit: (input: {
		comment: string;
		target: AgentTarget;
	}) => void | Promise<void>;
}

export function AgentCommentComposer({
	workspaceId,
	startLine,
	endLine,
	onCancel,
	onSubmit,
}: AgentCommentComposerProps) {
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

	const { value, placement, resolved, onValueChange, onPlacementChange } =
		useDiffCommentTarget({ sessions, configs });

	const [comment, setComment] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.focus();
		const len = el.value.length;
		el.setSelectionRange(len, len);
	}, []);

	const lineLabel =
		startLine === endLine
			? `Line ${startLine}`
			: `Lines ${startLine}–${endLine}`;
	const canSubmit =
		comment.trim().length > 0 && !submitting && resolved != null;
	const showPlacement = resolved?.kind === "new";

	const handleSubmit = async () => {
		if (!canSubmit || !resolved) return;
		setSubmitting(true);
		try {
			await onSubmit({ comment: comment.trim(), target: resolved });
		} catch (error) {
			// User-facing errors are the caller's responsibility (we toast in
			// DiffPane's submit path). Catch here so a rejection doesn't leak
			// as an unhandled promise out of the form's synchronous handlers.
			console.error("[AgentCommentComposer] submit failed", error);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form
			className={cn(
				"diff-comment mx-3 my-1.5 overflow-hidden rounded-lg border border-border/80 bg-popover text-popover-foreground",
				"shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12),0_2px_4px_-2px_rgba(0,0,0,0.06)]",
			)}
			onSubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					e.stopPropagation();
					onCancel();
				}
				if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
					e.preventDefault();
					handleSubmit();
				}
			}}
		>
			<div className="flex items-center justify-between px-3 pt-2 pb-1">
				<span className="text-[11px] font-medium tracking-tight text-muted-foreground">
					{lineLabel}
				</span>
				<span className="text-[10px] tracking-tight text-muted-foreground/70">
					esc to dismiss
				</span>
			</div>

			<div className="px-3 pb-2">
				<textarea
					ref={textareaRef}
					value={comment}
					onChange={(e) => setComment(e.target.value)}
					placeholder="Ask the AI about these lines…"
					rows={3}
					className={cn(
						"block w-full resize-none bg-transparent text-[13px] leading-snug text-foreground",
						"placeholder:text-muted-foreground/60",
						"focus:outline-none focus-visible:outline-none",
					)}
				/>
			</div>

			<div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-2.5 py-1.5">
				<AgentPickerSelect
					value={value}
					onValueChange={onValueChange}
					sessions={sessions}
					configs={configs}
				/>
				{showPlacement ? (
					<AgentPlacementToggle
						value={placement}
						onValueChange={onPlacementChange}
					/>
				) : null}
				<div className="ml-auto flex items-center gap-1">
					<Button
						type="button"
						size="xs"
						variant="ghost"
						onClick={onCancel}
						disabled={submitting}
						className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						size="xs"
						disabled={!canSubmit}
						className={cn(
							"h-7 gap-1.5 px-2.5 text-[11px] font-medium",
							"bg-primary text-primary-foreground hover:bg-primary/90",
							"disabled:opacity-40",
						)}
					>
						{submitting ? (
							<LuLoaderCircle className="size-3 animate-spin" />
						) : null}
						<span>{submitting ? "Sending…" : "Comment"}</span>
						{submitting ? null : <KbdEnter />}
					</Button>
				</div>
			</div>
		</form>
	);
}

const IS_MAC =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("mac");

function KbdEnter() {
	return (
		<span
			className={cn(
				"inline-flex h-4 items-center gap-0.5 rounded-[3px] border border-primary-foreground/20 bg-primary-foreground/10 px-1",
				"text-[9px] font-medium leading-none text-primary-foreground/85",
			)}
		>
			<span>{IS_MAC ? "⌘" : "Ctrl"}</span>
			<LuCornerDownLeft className="size-2.5" strokeWidth={2.5} />
		</span>
	);
}
