import { useLingui } from "@lingui/react/macro";
import { useSessionStatus } from "renderer/lib/auth-client";
import { useSignInAgain } from "./hooks/useSignInAgain";

interface SessionEndedPromptProps {
	isCollapsed: boolean;
}

export function SessionEndedPrompt({ isCollapsed }: SessionEndedPromptProps) {
	const { t } = useLingui();
	const sessionStatus = useSessionStatus();
	const { signInAgain, isPending } = useSignInAgain();
	if (sessionStatus !== "ended") return null;

	const title = t({ message: "Signed out of Superset" });
	const signInAgainLabel = t({ message: "Sign in again" });
	if (isCollapsed) {
		return (
			<button
				type="button"
				className="flex w-full justify-center py-1"
				title={title}
				aria-label={signInAgainLabel}
				disabled={isPending}
				onClick={() => void signInAgain()}
			>
				<span className="size-1.5 rounded-full bg-amber-500" />
			</button>
		);
	}
	return (
		<div className="mx-2 mb-1 flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground">
			<span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
			<span className="min-w-0 flex-1 truncate">{title}</span>
			<button
				type="button"
				className="shrink-0 font-medium text-foreground hover:underline disabled:opacity-50"
				disabled={isPending}
				onClick={() => void signInAgain()}
			>
				{signInAgainLabel}
			</button>
		</div>
	);
}
