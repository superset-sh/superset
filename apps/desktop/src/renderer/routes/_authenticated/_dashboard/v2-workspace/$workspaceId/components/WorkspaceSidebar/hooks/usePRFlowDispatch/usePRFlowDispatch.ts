import { useCallback, useRef, useState } from "react";
import type { ChatPaneData } from "../../../../types";
import { buildPRContext } from "../../components/PRActionHeader/utils/buildPRContext";
import type { PRFlowState } from "../../components/PRActionHeader/utils/getPRFlowState";

/**
 * Opens a chat pane (or reuses one later — see plan phase 7) pre-populated
 * with a slash command and a synthesized `pr-context.md` attachment.
 *
 * For the MVP, `onOpenChat` always creates a new chat tab. The V2 workspace
 * page wires this up by calling `store.getState().addTab({ kind: "chat", ... })`.
 */
export type OpenChatFn = (launchConfig: ChatPaneData["launchConfig"]) => void;

export interface PRFlowDispatchArgs {
	state: PRFlowState;
	draft?: boolean;
}

export type PRFlowDispatch = (args: PRFlowDispatchArgs) => void;

export type GhCliGateReason = "not-installed" | "not-authenticated";

interface UsePRFlowDispatchOptions {
	onOpenChat: OpenChatFn;
}

interface UsePRFlowDispatchResult {
	dispatch: PRFlowDispatch;
	/** Non-null when the last dispatch was blocked on the GitHub CLI. */
	ghGate: GhCliGateReason | null;
	/** Re-detects gh; resumes the blocked dispatch once it's ready. */
	recheckGhGate: () => void;
	dismissGhGate: () => void;
}

export function usePRFlowDispatch({
	onOpenChat,
}: UsePRFlowDispatchOptions): UsePRFlowDispatchResult {
	const [ghGate, setGhGate] = useState<GhCliGateReason | null>(null);
	const pendingRef = useRef<PRFlowDispatchArgs | null>(null);

	const proceed = useCallback(
		({ state, draft }: PRFlowDispatchArgs) => {
			const plan = planDispatch(state, { draft: draft === true });
			if (!plan) return;

			onOpenChat({
				initialPrompt: plan.prompt,
				initialFiles: [plan.attachment],
			});
		},
		[onOpenChat],
	);

	const dispatch = useCallback<PRFlowDispatch>(
		(args) => {
			void (async () => {
				const gate = await detectGhCliGate();
				if (gate) {
					pendingRef.current = args;
					setGhGate(gate);
					return;
				}
				proceed(args);
			})();
		},
		[proceed],
	);

	const recheckGhGate = useCallback(() => {
		void (async () => {
			const gate = await detectGhCliGate();
			if (gate) {
				setGhGate(gate);
				return;
			}
			setGhGate(null);
			const pending = pendingRef.current;
			pendingRef.current = null;
			if (pending) proceed(pending);
		})();
	}, [proceed]);

	const dismissGhGate = useCallback(() => {
		pendingRef.current = null;
		setGhGate(null);
	}, []);

	return { dispatch, ghGate, recheckGhGate, dismissGhGate };
}

async function detectGhCliGate(): Promise<GhCliGateReason | null> {
	try {
		// Dynamic import keeps this module loadable outside Electron (tests).
		const { electronTrpcClient } = await import("renderer/lib/trpc-client");
		const gh = await electronTrpcClient.system.detectGhCli.query();
		return getGhCliGateReason(gh);
	} catch {
		// Detection failing must not block the PR flow itself.
		return null;
	}
}

export function getGhCliGateReason(gh: {
	installed: boolean;
	authenticated: boolean;
}): GhCliGateReason | null {
	if (!gh.installed) return "not-installed";
	if (!gh.authenticated) return "not-authenticated";
	return null;
}

interface DispatchPlan {
	prompt: string;
	attachment: {
		data: string;
		mediaType: string;
		filename: string;
	};
}

export function planDispatch(
	state: PRFlowState,
	options: { draft: boolean },
): DispatchPlan | null {
	switch (state.kind) {
		case "no-pr": {
			const prompt = options.draft ? "/pr/create-pr --draft" : "/pr/create-pr";
			const markdown = buildPRContext(state);
			return {
				prompt,
				attachment: {
					data: encodeAsDataUrl(markdown, "text/markdown"),
					mediaType: "text/markdown",
					filename: "pr-context.md",
				},
			};
		}
		// MVP scope: other states don't dispatch yet.
		default:
			return null;
	}
}

function encodeAsDataUrl(content: string, mediaType: string): string {
	// `unescape` is removed from WHATWG; use TextEncoder for UTF-8 → base64.
	// Branch names + commit messages can carry non-ASCII characters.
	const base64 =
		typeof btoa === "function"
			? btoa(
					Array.from(new TextEncoder().encode(content), (b) =>
						String.fromCharCode(b),
					).join(""),
				)
			: Buffer.from(content, "utf-8").toString("base64");
	return `data:${mediaType};base64,${base64}`;
}
