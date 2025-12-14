import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import type { AuthProvider } from "shared/auth";
import { trpc } from "../lib/trpc";

/**
 * Hook for managing authentication state in the renderer process
 */
export function useAuth() {
	const [isSigningIn, setIsSigningIn] = useState(false);
	const utils = trpc.useUtils();

	const { data: authState } = trpc.auth.getState.useQuery();
	const isSignedIn = authState?.isSignedIn ?? false;

	// Subscribe to auth state changes and invalidate query
	trpc.auth.onStateChange.useSubscription(undefined, {
		onData: () => utils.auth.getState.invalidate(),
	});

	const signInMutation = trpc.auth.signIn.useMutation({
		onMutate: () => setIsSigningIn(true),
		onError: () => setIsSigningIn(false),
	});

	const signOutMutation = trpc.auth.signOut.useMutation({
		onSuccess: () => toast.success("Signed out"),
	});

	// Reset isSigningIn when user becomes signed in
	useEffect(() => {
		if (isSignedIn) setIsSigningIn(false);
	}, [isSignedIn]);

	return {
		isSignedIn,
		isLoading: !authState,
		isSigningIn,
		signIn: (provider: AuthProvider) => signInMutation.mutate({ provider }),
		signOut: () => signOutMutation.mutate(),
	};
}
