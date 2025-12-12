"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";

import type { AuthState, User } from "./types";

const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProps {
	children: ReactNode;
	user: User;
}

/**
 * Mock auth provider for client components.
 * Receives user from server component and provides it to children.
 *
 * When real auth (Clerk) is added, replace with ClerkProvider.
 */
export function AuthProvider({ children, user }: AuthProviderProps) {
	const value = useMemo<AuthState>(
		() => ({
			user,
			isLoaded: true,
			isSignedIn: true,
		}),
		[user],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth state in client components.
 *
 * When real auth (Clerk) is added, replace with useAuth() from @clerk/nextjs.
 */
export function useAuth(): AuthState {
	const context = useContext(AuthContext);

	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}

	return context;
}

/**
 * Hook to access the current user in client components.
 * Returns null if not signed in.
 */
export function useUser(): User | null {
	const { user } = useAuth();
	return user;
}

/**
 * Mock sign out function.
 * When real auth is added, this will call Clerk's signOut.
 */
export function useSignOut() {
	const signOut = useCallback(() => {
		// Mock: redirect to web app
		window.location.href = process.env.NEXT_PUBLIC_WEB_URL || "/";
	}, []);

	return { signOut };
}
