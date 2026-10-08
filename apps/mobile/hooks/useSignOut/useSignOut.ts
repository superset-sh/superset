import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { signOut } from "@/lib/auth/client";
import { clearWarmTerminals } from "@/lib/terminal/warmTerminalCache";

export function useSignOut() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [isSigningOut, setIsSigningOut] = useState(false);

	const handleSignOut = useCallback(async () => {
		setIsSigningOut(true);
		try {
			await signOut();
			queryClient.clear();
			// Cached scrollback belongs to the account that just left.
			clearWarmTerminals();
			router.replace("/(auth)/sign-in");
		} catch (error) {
			console.error("[auth/signOut] Failed to sign out:", error);
		} finally {
			setIsSigningOut(false);
		}
	}, [router, queryClient]);

	return { signOut: handleSignOut, isSigningOut };
}
