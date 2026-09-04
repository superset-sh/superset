import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { X } from "lucide-react";
import { useEffect } from "react";
import { AnimatedStarButton } from "renderer/components/AnimatedStarButton";
import {
	canActivateStarAction,
	useGithubStarAction,
} from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";
import { useStarNagStore } from "renderer/stores/star-nag";

function StarNagToastContent({ toastId }: { toastId: string | number }) {
	const { t } = useLingui();
	const { state, activate, isBusy } = useGithubStarAction();
	const dismiss = useStarNagStore((s) => s.dismiss);

	useEffect(() => {
		if (state !== "starred") return;
		const timer = setTimeout(() => toast.dismiss(toastId), 2_000);
		return () => clearTimeout(timer);
	}, [state, toastId]);

	function handleAction() {
		// A click during the post-star celebration window (state === "starred")
		// reaches this handler but activate() no-ops for it — don't record a
		// "starred" event for a click that didn't actually do anything.
		if (canActivateStarAction(state)) {
			track("star_nag_starred", { surface: "toast" });
		}
		activate();
	}

	function handleClose() {
		track("star_nag_dismissed", { surface: "toast" });
		dismiss();
		toast.dismiss(toastId);
	}

	return (
		<div className="w-[356px] rounded-lg border border-border bg-popover p-4 shadow-lg select-text">
			<div className="flex items-start justify-between gap-2">
				<p className="text-sm font-semibold text-popover-foreground">
					<Trans>You're all set!</Trans>
				</p>
				<button
					type="button"
					onClick={handleClose}
					aria-label={t({
						message: "Dismiss",
					})}
					className="text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" />
				</button>
			</div>
			<p className="mt-1 text-xs text-muted-foreground">
				<Trans>
					If you're enjoying Superset so far, a GitHub star helps other
					developers discover it.
				</Trans>
			</p>
			{/* A "loading" or "unknown" read isn't trustworthy enough to act on —
			same rule as every other star-nag surface — so the button just doesn't
			render for those; the toast itself still auto-dismisses/closes normally.
			Unlike GitHubStarPill/StarNagCard, "starred" isn't time-boxed via
			useJustStarredWindow here — the effect above already dismisses the
			whole toast 2s after a real star, so there's no separate window to
			bound. */}
			{(canActivateStarAction(state) || state === "starred") && (
				<AnimatedStarButton
					state={state}
					busy={isBusy}
					onActivate={handleAction}
					className="mt-3 w-full justify-center"
					compact
				/>
			)}
		</div>
	);
}

// Bounded so an ignored toast eventually records a dismissal (see
// onAutoClose below) instead of silently never entering cooldown.
const TOAST_DURATION_MS = 30_000;

// finish() in page.tsx is guarded against re-entry by navigation away from
// the route, but a rapid double-click on the create/clone/open button can
// still fire it twice before that navigation commits. Since isEligible()
// doesn't flip until the toast is starred or dismissed, that race could
// otherwise stack two toasts — this makes the toast a true once-per-session
// event regardless.
let shownThisSession = false;

/** Fires once, right after onboarding completes — a no-op if the user has
 * already starred or is within an active cooldown from a prior dismissal. */
export function showStarNagOnboardingToast() {
	if (shownThisSession) return;
	if (!useStarNagStore.getState().isEligible()) return;
	shownThisSession = true;
	track("star_nag_shown", { surface: "toast" });
	toast.custom((id) => <StarNagToastContent toastId={id} />, {
		duration: TOAST_DURATION_MS,
		// Only fires when the toast's own duration elapses naturally — a
		// manual toast.dismiss() from starring or clicking the X does not
		// trigger this, so it can't double-count a dismissal. Ignoring the
		// toast isn't an explicit "no thanks", so it starts the same cooldown
		// as a real dismiss() without also doubling the sidebar card's
		// threshold — the default new-user path (see the toast, keep working)
		// would otherwise make the card nearly impossible to trigger.
		onAutoClose: () => {
			track("star_nag_dismissed", { surface: "toast" });
			useStarNagStore.getState().snoozeThresholdCard();
		},
	});
}

/** Dev-only: renders the toast regardless of eligibility/cooldown/session
 * state, for previewing via the command palette. Does not track "shown". */
export function previewStarNagOnboardingToast() {
	toast.custom((id) => <StarNagToastContent toastId={id} />, {
		duration: TOAST_DURATION_MS,
	});
}
