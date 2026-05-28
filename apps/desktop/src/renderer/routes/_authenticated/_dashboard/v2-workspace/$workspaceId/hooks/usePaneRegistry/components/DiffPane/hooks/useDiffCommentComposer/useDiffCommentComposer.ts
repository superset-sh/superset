import type {
	CodeViewLineSelection,
	DiffLineAnnotation,
	SelectedLineRange,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { toast } from "@superset/ui/sonner";
import { type RefObject, useCallback, useMemo, useState } from "react";
import {
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
	/** Resolves the changeset file behind a CodeView item id. We take a
	 *  getter (not the map directly) because the map is produced by
	 *  `useDiffCodeViewItems`, which itself consumes this hook's annotation
	 *  output — passing a stable accessor breaks the dependency cycle. */
	getFile: (itemId: string) => ChangesetFile | undefined;
	onCreateNewAgentSession?: (
		input: CreateNewAgentSessionInput,
	) => Promise<{ terminalId: string } | null>;
}

interface UseDiffCommentComposerResult {
	composerAnnotationsByItemId: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	> | null;
	onSelectedLinesChange: (selection: CodeViewLineSelection | null) => void;
	onGutterUtilityClick: () => void;
	clear: () => void;
	submit: (input: DiffCommentSubmitInput) => Promise<void>;
}

/**
 * Owns the DiffPane's inline agent-comment composer:
 *   - tracks the live pierre selection that anchors the composer
 *   - synthesises the composer annotation injected via
 *     useDiffCodeViewItems' `extraAnnotationsByItemId`
 *   - dispatches submit between the existing-terminal writeInput path
 *     and the host `agents.run`-backed new-session path
 *
 * DiffPane only wires CodeView events; all composer state lives here.
 */
export function useDiffCommentComposer({
	workspaceId,
	codeViewRef,
	getFile,
	onCreateNewAgentSession,
}: UseDiffCommentComposerArgs): UseDiffCommentComposerResult {
	const [composer, setComposer] = useState<ComposerState | null>(null);
	const { send: sendToTerminalAgent } = useSendToTerminalAgent();

	const clear = useCallback(() => {
		setComposer(null);
		codeViewRef.current?.clearSelectedLines();
	}, [codeViewRef]);

	const onSelectedLinesChange = useCallback(
		(selection: CodeViewLineSelection | null) => {
			if (!selection) {
				setComposer(null);
				return;
			}
			setComposer({ itemId: selection.id, range: selection.range });
		},
		[],
	);

	// Pierre gates the gutter "+" button's pointer flow behind a non-null
	// onGutterUtilityClick (InteractionManager.startGutterSelectionFromPointerDown
	// early-returns otherwise). We mirror the open from the CodeView's
	// current selection — pierre updates that during the pointer session.
	const onGutterUtilityClick = useCallback(() => {
		const selection = codeViewRef.current?.getSelectedLines();
		if (selection) {
			setComposer({ itemId: selection.id, range: selection.range });
		}
	}, [codeViewRef]);

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
			if (!composer) return;
			const file = getFile(composer.itemId);
			if (!file) return;

			const text = formatAgentPromptWithFileContext({
				comment: input.comment,
				file: {
					path: file.path,
					startLine: composer.range.start,
					endLine: composer.range.end,
				},
			});

			if (input.target.kind === "new") {
				if (!onCreateNewAgentSession) {
					toast.error("Couldn't start a new agent session");
					return;
				}
				// Host bakes the prompt into the launch command (argv/stdin per
				// the agent config), so no follow-up writeInput here.
				const result = await onCreateNewAgentSession({
					configId: input.target.configId,
					placement: input.target.placement,
					prompt: text,
				});
				if (result) clear();
				return;
			}

			try {
				await sendToTerminalAgent({
					workspaceId,
					terminalId: input.target.terminalId,
					text,
				});
				clear();
			} catch {
				// Toast surfaced by the hook; keep composer open so the user
				// can retry or edit.
			}
		},
		[
			composer,
			getFile,
			workspaceId,
			sendToTerminalAgent,
			clear,
			onCreateNewAgentSession,
		],
	);

	return {
		composerAnnotationsByItemId,
		onSelectedLinesChange,
		onGutterUtilityClick,
		clear,
		submit,
	};
}
