import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuCornerDownLeft, LuPlus } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import {
	type TerminalAgentBinding,
	useTerminalAgentBindings,
} from "renderer/hooks/host-service/useTerminalAgentBindings";

export type AgentTarget =
	| { kind: "existing"; terminalId: string }
	| { kind: "new" };

interface AgentCommentComposerProps {
	workspaceId: string;
	startLine: number;
	endLine: number;
	onCancel: () => void;
	onSubmit: (input: { comment: string; target: AgentTarget }) => void;
}

const NEW_SESSION_VALUE = "__new__";

export function AgentCommentComposer({
	workspaceId,
	startLine,
	endLine,
	onCancel,
	onSubmit,
}: AgentCommentComposerProps) {
	const bindings = useTerminalAgentBindings(workspaceId);
	const sessions = Array.from(bindings.values()).sort(
		(a, b) => b.lastEventAt - a.lastEventAt,
	);

	const [comment, setComment] = useState("");
	const [target, setTarget] = useState<string>(
		sessions[0]?.terminalId ?? NEW_SESSION_VALUE,
	);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.focus();
		// Place caret at the end on focus-restore
		const len = el.value.length;
		el.setSelectionRange(len, len);
	}, []);

	const lineLabel =
		startLine === endLine
			? `Line ${startLine}`
			: `Lines ${startLine}–${endLine}`;
	const canSubmit = comment.trim().length > 0;

	const handleSubmit = () => {
		if (!canSubmit) return;
		const resolved: AgentTarget =
			target === NEW_SESSION_VALUE
				? { kind: "new" }
				: { kind: "existing", terminalId: target };
		onSubmit({ comment: comment.trim(), target: resolved });
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
			{/* Header row: line range + close affordance via Esc hint */}
			<div className="flex items-center justify-between px-3 pt-2 pb-1">
				<span className="text-[11px] font-medium tracking-tight text-muted-foreground">
					{lineLabel}
				</span>
				<span className="text-[10px] tracking-tight text-muted-foreground/70">
					esc to dismiss
				</span>
			</div>

			{/* Textarea — borderless, blends into the card */}
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

			{/* Footer: agent picker (left) + actions (right) */}
			<div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-2.5 py-1.5">
				<Select value={target} onValueChange={setTarget}>
					<SelectTrigger
						size="sm"
						className={cn(
							"h-7 min-w-40 gap-1.5 border-border/60 bg-popover px-2 text-[11px]",
							"hover:bg-accent/50",
						)}
					>
						<SelectValue placeholder="Choose agent" />
					</SelectTrigger>
					<SelectContent align="start" className="min-w-52">
						{sessions.map((session) => (
							<SelectItem
								key={session.terminalId}
								value={session.terminalId}
								className="text-[12px]"
							>
								<AgentOption binding={session} />
							</SelectItem>
						))}
						<SelectItem value={NEW_SESSION_VALUE} className="text-[12px]">
							<span className="inline-flex items-center gap-1.5">
								<LuPlus className="size-3 text-muted-foreground" />
								<span>New agent session</span>
							</span>
						</SelectItem>
					</SelectContent>
				</Select>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						size="xs"
						variant="ghost"
						onClick={onCancel}
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
						<span>Comment</span>
						<KbdEnter />
					</Button>
				</div>
			</div>
		</form>
	);
}

function AgentOption({ binding }: { binding: TerminalAgentBinding }) {
	const iconSrc = usePresetIcon(binding.agentId);
	const label =
		(binding.agentId in BUILTIN_AGENT_LABELS &&
			BUILTIN_AGENT_LABELS[
				binding.agentId as keyof typeof BUILTIN_AGENT_LABELS
			]) ||
		binding.agentId;
	return (
		<span className="inline-flex items-center gap-1.5">
			{iconSrc ? (
				<img
					src={iconSrc}
					alt=""
					className="size-3 shrink-0"
					draggable={false}
				/>
			) : null}
			<span>{label}</span>
			<span className="text-muted-foreground/70">
				· {shortId(binding.terminalId)}
			</span>
		</span>
	);
}

function KbdEnter() {
	return (
		<span
			className={cn(
				"inline-flex h-4 items-center gap-0.5 rounded-[3px] border border-primary-foreground/20 bg-primary-foreground/10 px-1",
				"text-[9px] font-medium leading-none text-primary-foreground/85",
			)}
		>
			<span>⌘</span>
			<LuCornerDownLeft className="size-2.5" strokeWidth={2.5} />
		</span>
	);
}

function shortId(id: string): string {
	return id.slice(0, 6);
}
