import type { AgentTarget } from "../../../../../../../../DiffPane/components/AgentCommentComposer";
import type { CapturedEditorSelection } from "../../CodeEditorAdapter";
import { shouldRefuseSelection } from "./shouldRefuseSelection";

/** The decision send() makes BEFORE it dispatches, given the captured region and
 *  the resolved target. Splitting this out of the hook makes the no-agent branch
 *  unit-testable without a renderHook harness (the renderer has none).
 *
 *  - `no-selection` → the capture is null/empty/unresolvable; send() is inert.
 *  - `no-agent`     → there IS a sendable selection, but the target ladder
 *                     produced nothing (no live terminal agent AND no agent
 *                     config). send() MUST surface a clear toast, never drop.
 *  - `dispatch`     → there is a sendable selection AND a target (existing
 *                     session or {kind:"new"} config) to dispatch into. */
export type SendOutcome = "dispatch" | "no-agent" | "no-selection";

/** Pure classifier: maps (captured region, resolved target) → the send outcome.
 *  `region` is what `getSelection(path)` returned; `target` is the resolver's
 *  output (null when the ladder is empty). Mirrors the refuse gate already used
 *  by send() so the empty-selection check is not duplicated. */
export function resolveSendOutcome(
	region: CapturedEditorSelection | null | undefined,
	target: AgentTarget | null,
): SendOutcome {
	if (shouldRefuseSelection(region)) return "no-selection";
	if (target === null) return "no-agent";
	return "dispatch";
}
