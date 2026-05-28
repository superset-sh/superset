import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuCornerDownLeft, LuLoaderCircle, LuPlus } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import {
	type TerminalAgentBinding,
	useTerminalAgentBindings,
} from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";

export type AgentTarget =
	| { kind: "existing"; terminalId: string }
	| { kind: "new"; configId: string };

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

const LAST_NEW_AGENT_CONFIG_ID_KEY = "lastSelectedDiffCommentNewAgentConfigId";
const LAST_TERMINAL_ID_KEY = "lastSelectedDiffCommentTerminalId";
const EXISTING_PREFIX = "existing:";
const NEW_PREFIX = "new:";

function decodeTarget(value: string): AgentTarget | null {
	if (value.startsWith(EXISTING_PREFIX)) {
		return {
			kind: "existing",
			terminalId: value.slice(EXISTING_PREFIX.length),
		};
	}
	if (value.startsWith(NEW_PREFIX)) {
		return { kind: "new", configId: value.slice(NEW_PREFIX.length) };
	}
	return null;
}

function readStorage(key: string): string | null {
	if (typeof window === "undefined") return null;
	return window.localStorage.getItem(key);
}

function persistStorage(key: string, value: string) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(key, value);
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

	const [comment, setComment] = useState("");
	const [target, setTarget] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Resolve the default selection once sessions + configs are loaded.
	// Priority:
	//   1. last picked terminal session (persisted), if still alive
	//   2. most recent active session
	//   3. last picked new-agent config (persisted), if still listed
	//   4. first config
	useEffect(() => {
		if (target !== null) return;

		if (sessions.length > 0) {
			const storedTerminalId = readStorage(LAST_TERMINAL_ID_KEY);
			const stillAlive =
				storedTerminalId &&
				sessions.some((s) => s.terminalId === storedTerminalId)
					? storedTerminalId
					: null;
			const terminalId = stillAlive ?? sessions[0]?.terminalId;
			if (terminalId) {
				setTarget(`${EXISTING_PREFIX}${terminalId}`);
				return;
			}
		}

		if (configs.length === 0) return;
		const storedConfigId = readStorage(LAST_NEW_AGENT_CONFIG_ID_KEY);
		const fromStorage =
			storedConfigId && configs.some((c) => c.id === storedConfigId)
				? storedConfigId
				: null;
		const fallback = fromStorage ?? configs[0]?.id;
		if (fallback) setTarget(`${NEW_PREFIX}${fallback}`);
	}, [target, sessions, configs]);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.focus();
		const len = el.value.length;
		el.setSelectionRange(len, len);
	}, []);

	const handleTargetChange = (next: string) => {
		setTarget(next);
		const decoded = decodeTarget(next);
		if (decoded?.kind === "new") {
			persistStorage(LAST_NEW_AGENT_CONFIG_ID_KEY, decoded.configId);
		}
		if (decoded?.kind === "existing") {
			persistStorage(LAST_TERMINAL_ID_KEY, decoded.terminalId);
		}
	};

	const lineLabel =
		startLine === endLine
			? `Line ${startLine}`
			: `Lines ${startLine}–${endLine}`;
	const decodedTarget = target ? decodeTarget(target) : null;
	const canSubmit =
		comment.trim().length > 0 && !submitting && decodedTarget != null;

	const handleSubmit = async () => {
		if (!canSubmit || !decodedTarget) return;
		setSubmitting(true);
		try {
			await onSubmit({ comment: comment.trim(), target: decodedTarget });
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
				<Select value={target ?? undefined} onValueChange={handleTargetChange}>
					<SelectTrigger
						size="sm"
						className={cn(
							"h-7 min-w-40 gap-1.5 border-border/60 bg-popover px-2 text-[11px]",
							"hover:bg-accent/50",
						)}
					>
						<SelectValue placeholder="Choose agent" />
					</SelectTrigger>
					<SelectContent align="start" className="min-w-60">
						{sessions.length > 0 ? (
							<SelectGroup>
								<SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
									Active sessions
								</SelectLabel>
								{sessions.map((session) => (
									<SelectItem
										key={session.terminalId}
										value={`${EXISTING_PREFIX}${session.terminalId}`}
										className="text-[12px]"
									>
										<ExistingSessionOption binding={session} />
									</SelectItem>
								))}
							</SelectGroup>
						) : null}
						{sessions.length > 0 && configs.length > 0 ? (
							<SelectSeparator />
						) : null}
						{configs.length > 0 ? (
							<SelectGroup>
								<SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
									Start new session
								</SelectLabel>
								{configs.map((config) => (
									<SelectItem
										key={config.id}
										value={`${NEW_PREFIX}${config.id}`}
										className="text-[12px]"
									>
										<NewSessionOption
											label={config.label}
											presetId={config.presetId}
										/>
									</SelectItem>
								))}
							</SelectGroup>
						) : null}
					</SelectContent>
				</Select>
				<div className="flex items-center gap-1">
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

function ExistingSessionOption({ binding }: { binding: TerminalAgentBinding }) {
	const iconSrc = usePresetIcon(binding.agentId);
	return (
		<span className="inline-flex items-center gap-1.5">
			<AgentIcon src={iconSrc} />
			<span>{binding.agentId}</span>
			<span className="text-muted-foreground/70">
				· {shortId(binding.terminalId)}
			</span>
		</span>
	);
}

function NewSessionOption({
	label,
	presetId,
}: {
	label: string;
	presetId: string;
}) {
	const iconSrc = usePresetIcon(presetId);
	return (
		<span className="inline-flex items-center gap-1.5">
			<AgentIcon src={iconSrc} fallback={<LuPlus className="size-3" />} />
			<span>{label}</span>
		</span>
	);
}

function AgentIcon({
	src,
	fallback,
}: {
	src: string | null | undefined;
	fallback?: React.ReactNode;
}) {
	if (src) {
		return (
			<img src={src} alt="" className="size-3 shrink-0" draggable={false} />
		);
	}
	return <span className="text-muted-foreground/80">{fallback ?? null}</span>;
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
