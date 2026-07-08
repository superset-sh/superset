import type { AppRouter } from "@superset/host-service";
import {
	PromptInputProvider,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuCornerDownLeft, LuLoaderCircle } from "react-icons/lu";
import { TiptapPromptEditor } from "renderer/components/Chat/ChatInterface/components/TiptapPromptEditor/TiptapPromptEditor";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { AgentPickerSelect } from "./components/AgentPickerSelect";
import { AgentPlacementToggle } from "./components/AgentPlacementToggle";
import {
	type AgentTarget,
	useDiffCommentTarget,
} from "./hooks/useDiffCommentTarget";
import { prepareDiffCommentSubmission } from "./prepareDiffCommentSubmission";

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

/**
 * Inline diff-comment composer. Reuses the chat/terminal rich-input stack
 * (PromptInputProvider + TiptapPromptEditor) so slash commands and @file
 * mentions work here too — parity with the workspace chat input and the
 * terminal rich-input overlay (`TerminalRichInput`). The editor serializes
 * chips back to plain text on submit, so the send payload
 * (`comment.trim()` + resolved agent target) is identical to the previous
 * plain-<textarea> implementation.
 */
export function AgentCommentComposer(props: AgentCommentComposerProps) {
	return (
		<PromptInputProvider>
			<AgentCommentComposerInner {...props} />
		</PromptInputProvider>
	);
}

function AgentCommentComposerInner({
	workspaceId,
	startLine,
	endLine,
	onCancel,
	onSubmit,
}: AgentCommentComposerProps) {
	const controller = usePromptInputController();

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

	// Slash commands + file search + cwd, wired exactly like the v2 chat input
	// so the rich editor's `/` and `@` popovers behave identically here.
	const { data: workspaceStatus } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ refetchOnWindowFocus: false, retry: false },
	);
	const cwd = workspaceStatus?.worktreePath ?? "";

	const trpcUtils = workspaceTrpc.useUtils();
	const searchFiles = useCallback(
		async (query: string) => {
			const { matches } = await trpcUtils.filesystem.searchFiles.fetch({
				workspaceId,
				query,
				includeHidden: false,
				limit: 20,
			});
			return matches.map((m) => ({
				id: m.absolutePath,
				name: m.name,
				relativePath: m.relativePath,
			}));
		},
		[trpcUtils, workspaceId],
	);

	const selectSlashCommands = useCallback(
		(
			commands: NonNullable<
				inferRouterOutputs<AppRouter>["chat"]["getSlashCommands"]
			>,
		) =>
			commands.map((command) => ({
				...command,
				kind:
					command.kind === "builtin"
						? ("builtin" as const)
						: ("custom" as const),
				source:
					command.kind === "builtin"
						? ("builtin" as const)
						: ("project" as const),
			})),
		[],
	);
	const { data: slashCommands = [] } =
		workspaceTrpc.chat.getSlashCommands.useQuery(
			{ workspaceId },
			{ select: selectSlashCommands },
		);

	const [submitting, setSubmitting] = useState(false);

	// Autofocus the editor on open. A single focus() can land before the Tiptap
	// editor is created (immediatelyRender: false), so retry across frames until
	// focus is actually inside the overlay — mirrors TerminalRichInput.
	const rootRef = useRef<HTMLFormElement | null>(null);
	useEffect(() => {
		let cancelled = false;
		const attempt = (triesLeft: number) => {
			if (cancelled || triesLeft <= 0) return;
			controller.textInput.focus();
			requestAnimationFrame(() => {
				if (cancelled) return;
				const root = rootRef.current;
				if (root?.contains(document.activeElement)) return;
				attempt(triesLeft - 1);
			});
		};
		attempt(30);
		return () => {
			cancelled = true;
		};
	}, [controller]);

	const lineLabel =
		startLine === endLine
			? `Line ${startLine}`
			: `Lines ${startLine}–${endLine}`;
	const canSubmit =
		controller.textInput.value.trim().length > 0 &&
		!submitting &&
		resolved != null;
	const showPlacement = resolved?.kind === "new";

	const handleSubmit = async () => {
		const submission = prepareDiffCommentSubmission({
			text: controller.textInput.value,
			target: resolved,
		});
		if (!submission || submitting) return;
		setSubmitting(true);
		try {
			await onSubmit(submission);
			controller.textInput.clear();
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
			ref={rootRef}
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

			<TiptapPromptEditor
				cwd={cwd}
				searchFiles={searchFiles}
				slashCommands={slashCommands}
				placeholder="Ask the AI about these lines…"
				className="min-h-16 py-2 text-[13px] leading-snug"
			/>

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
