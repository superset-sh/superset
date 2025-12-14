import { useCallback, useState } from "react";
import type { AuthProvider } from "shared/auth";
import { trpc } from "../lib/trpc";

/**
 * Hook for managing authentication state in the renderer process
 */
export function useAuth() {
	const [isSigningIn, setIsSigningIn] = useState(false);

	const utils = trpc.useUtils();

	// Get initial state and subscribe to changes
	const { data: authState } = trpc.auth.getState.useQuery();

	// Subscribe to auth state changes
	trpc.auth.onStateChange.useSubscription(undefined, {
		onData: () => {
			// Invalidate the query to refetch the latest state
			utils.auth.getState.invalidate();
		},
	});

	const signInMutation = trpc.auth.signIn.useMutation({
		onMutate: () => {
			setIsSigningIn(true);
		},
		onSettled: () => {
			// Keep signing in state until we get the callback
			// It will be reset when auth state changes
		},
	});

	const signOutMutation = trpc.auth.signOut.useMutation({
		onSuccess: () => {
			utils.auth.getState.invalidate();
		},
	});

	const signIn = useCallback(
		(provider: AuthProvider) => {
			signInMutation.mutate({ provider });
		},
		[signInMutation],
	);

	const signOut = useCallback(() => {
		signOutMutation.mutate();
	}, [signOutMutation]);

	// Reset signing in state when auth state changes to signed in
	const isSignedIn = authState?.isSignedIn ?? false;
	if (isSignedIn && isSigningIn) {
		setIsSigningIn(false);
	}

	return {
		isSignedIn,
		isLoading: !authState,
		isSigningIn,
		user: authState?.user ?? null,
		signIn,
		signOut,
	};
}
