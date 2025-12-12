"use client";

import { useClerk, useAuth as useClerkAuth } from "@clerk/nextjs";
import { useCallback } from "react";

import { env } from "@/env";

import type { AuthState, User } from "./types";

export function useAuth(): AuthState {
	const { isLoaded, isSignedIn, userId } = useClerkAuth();

	return {
		user: null,
		isLoaded,
		isSignedIn: isSignedIn ?? false,
	};
}

export function useUser(): User | null {
	return null;
}

export function useSignOut() {
	const { signOut } = useClerk();

	const handleSignOut = useCallback(() => {
		signOut({ redirectUrl: env.NEXT_PUBLIC_WEB_URL });
	}, [signOut]);

	return { signOut: handleSignOut };
}
