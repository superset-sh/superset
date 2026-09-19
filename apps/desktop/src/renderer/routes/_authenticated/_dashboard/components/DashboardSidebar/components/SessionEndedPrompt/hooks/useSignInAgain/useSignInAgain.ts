import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { track } from "renderer/lib/analytics";
import { requestDevSignIn } from "renderer/lib/dev-sign-in";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { readLastAuthMethod } from "renderer/lib/last-auth-method";
import { resolveSignInAgainAction } from "../../utils/resolveSignInAgainAction";

export function useSignInAgain() {
	const navigate = useNavigate();
	const signInMutation = electronTrpc.auth.signIn.useMutation();
	const persistToken = electronTrpc.auth.persistToken.useMutation();
	const [isDevSignInRunning, setIsDevSignInRunning] = useState(false);

	const signInAgain = async () => {
		const action = resolveSignInAgainAction({
			lastMethod: readLastAuthMethod(),
			isDevelopment: env.NODE_ENV === "development",
		});
		if (action.type === "provider") {
			track("auth_started", { provider: action.provider });
			signInMutation.mutate({ provider: action.provider });
			return;
		}
		if (action.type === "dev") {
			setIsDevSignInRunning(true);
			try {
				await persistToken.mutateAsync(await requestDevSignIn());
				return;
			} catch (error) {
				console.warn("[sign-in-again] dev sign-in failed", error);
			} finally {
				setIsDevSignInRunning(false);
			}
		}
		await navigate({ to: "/sign-in" });
	};

	return {
		signInAgain,
		isPending: signInMutation.isPending || isDevSignInRunning,
	};
}
