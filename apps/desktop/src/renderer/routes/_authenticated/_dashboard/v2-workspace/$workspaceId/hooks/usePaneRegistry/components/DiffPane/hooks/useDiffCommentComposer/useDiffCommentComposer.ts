import type {
	CodeViewOptions,
	DiffLineAnnotation,
	SelectedLineRange,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { toast } from "@superset/ui/sonner";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { dispatchSelection } from "renderer/hooks/host-service/dispatchSelection";
import {
	type AgentPromptFileSide,
	formatAgentPromptWithFileContext,
	useSendToTerminalAgent,
} from "renderer/hooks/host-service/useSendToTerminalAgent";
import type { ChangesetFile } from "../../../../../useChangeset";
import type { AgentTarget } from "../../components/AgentCommentComposer";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

interface ComposerState {
	itemId: string;
	range: SelectedLineRange;
}

function rangeSide(
	start: SelectedLineRange["side"],
	end: SelectedLineRange["endSide"],
): AgentPromptFileSide | undefined {
	const endSide = end ?? start;
	if (!start || !endSide) return undefined;
	if (start === "deletions" && endSide === "deletions") return "deletions";
	if (start === "additions" && endSide === "additions") return "additions";
	return "mixed";
}

export interface DiffCommentSubmitInput {
	comment: string;
	target: AgentTarget;
}

interface CreateNewAgentSessionInput {
	configId: string;
	placement: "split-pane" | "new-tab";
	prompt: string;
}

interface UseDiffCommentComposerArgs {
	workspaceId: string;
	codeViewRef: RefObject<CodeViewHandle<DiffAnnotationMetadata> | null>;
	/** Getter (not the map) for the changeset file behind a CodeView item id;
	 *  a stable accessor breaks the cycle with useDiffCodeViewItems. */
	getFile: (itemId: string) => ChangesetFile | undefined;
	onCreateNewAgentSession?: (
		input: CreateNewAgentSessionInput,
	) => Promise<{ terminalId: string } | null>;
}

type OnLineSelectionEnd = NonNullable<
	CodeViewOptions<DiffAnnotationMetadata>["onLineSelectionEnd"]
>;

interface UseDiffCommentComposerResult {
	composerAnnotationsByItemId: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	> | null;
	onLineSelectionEnd: OnLineSelectionEnd;
	/** Open the composer for a resolved range directly (used by the
	 *  highlight-text path, which has no pierre selection context). */
	openForItem: (itemId: string, range: SelectedLineRange) => void;
	onGutterUtilityClick: () => void;
	clear: () => void;
	submit: (input: DiffCommentSubmitInput) => Promise<void>;
}

/** Owns the DiffPane's inline agent-comment composer: its pierre selection
 *  anchor, the injected composer annotation, and submit dispatch. */
export function useDiffCommentComposer({
	workspaceId,
	codeViewRef,
	getFile,
	onCreateNewAgentSession,
}: UseDiffCommentComposerArgs): UseDiffCommentComposerResult {
	const [composer, setComposer] = useState<ComposerState | null>(null);
	const composerRef = useRef(composer);
	composerRef.current = composer;
	const { send: sendToTerminalAgent } = useSendToTerminalAgent();

	const clear = useCallback(() => {
		setComposer(null);
		codeViewRef.current?.clearSelectedLines();
	}, [codeViewRef]);

	// Only clear if a newer composer hasn't superseded the one that submitted.
	const clearIfStillCurrent = useCallback(
		(submitted: ComposerState) => {
			if (composerRef.current === submitted) clear();
		},
		[clear],
	);

	const openForItem = useCallback(
		(itemId: string, range: SelectedLineRange) => {
			setComposer({ itemId, range });
		},
		[],
	);

	const onLineSelectionEnd = useCallback<OnLineSelectionEnd>(
		(range, context) => {
			if (context.type !== "diff") return;
			if (!range) {
				setComposer(null);
				return;
			}
			openForItem(context.item.id, range);
		},
		[openForItem],
	);

	// Required stub: pierre gates the gutter "+" flow behind a non-null handler,
	// but the open is handled via onLineSelectionEnd on pointer-up.
	const onGutterUtilityClick = useCallback(() => {}, []);

	const composerAnnotationsByItemId = useMemo(() => {
		if (!composer) return null;
		const endSide =
			composer.range.endSide ?? composer.range.side ?? "additions";
		const startSide = composer.range.side ?? endSide;
		const map = new Map<string, DiffLineAnnotation<DiffAnnotationMetadata>[]>();
		map.set(composer.itemId, [
			{
				side: endSide,
				lineNumber: composer.range.end,
				metadata: {
					kind: "composer",
					itemId: composer.itemId,
					startLine: composer.range.start,
					endLine: composer.range.end,
					startSide,
					endSide,
				},
			},
		]);
		return map;
	}, [composer]);

	const submit = useCallback(
		async (input: DiffCommentSubmitInput) => {
			const submitted = composer;
			if (!submitted) return;
			const file = getFile(submitted.itemId);
			if (!file) return;

			const text = formatAgentPromptWithFileContext({
				comment: input.comment,
				file: {
					path: file.path,
					startLine: submitted.range.start,
					endLine: submitted.range.end,
					side: rangeSide(submitted.range.side, submitted.range.endSide),
				},
			});

			const outcome = await dispatchSelection({
				workspaceId,
				text,
				target: input.target,
				sendToTerminalAgent,
				onCreateNewAgentSession,
				onMissingLauncher: () =>
					toast.error("Couldn't start a new agent session"),
			});

			// Keep the composer open on failed/no-launcher so the user can retry.
			if (outcome === "sent") clearIfStillCurrent(submitted);
		},
		[
			composer,
			getFile,
			workspaceId,
			sendToTerminalAgent,
			clearIfStillCurrent,
			onCreateNewAgentSession,
		],
	);

	return {
		composerAnnotationsByItemId,
		onLineSelectionEnd,
		openForItem,
		onGutterUtilityClick,
		clear,
		submit,
	};
}
