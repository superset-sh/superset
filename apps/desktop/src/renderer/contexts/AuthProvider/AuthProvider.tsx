import { ClerkProvider } from "@clerk/clerk-react";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { AuthSession } from "shared/ipc-channels/auth";
import { trpc } from "../../lib/trpc";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface AuthContextValue {
	session: AuthSession | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	signIn: () => Promise<void>;
	signUp: () => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook to access auth state and actions.
 * Returns null values if auth is not configured (missing VITE_CLERK_PUBLISHABLE_KEY).
 */
export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return context;
}

interface AuthProviderProps {
	children: React.ReactNode;
}

/**
 * Optional auth provider that wraps the app with Clerk authentication.
 * If VITE_CLERK_PUBLISHABLE_KEY is not set, auth features are disabled
 * but the app continues to work normally.
 */
export function AuthProvider({ children }: AuthProviderProps) {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [isLoading, setIsLoading] = useState(!!PUBLISHABLE_KEY);

	const { data: initialSession, isLoading: isQueryLoading } =
		trpc.auth.getSession.useQuery(undefined, {
			enabled: !!PUBLISHABLE_KEY,
		});

	const signInMutation = trpc.auth.startSignIn.useMutation();
	const signUpMutation = trpc.auth.startSignUp.useMutation();
	const signOutMutation = trpc.auth.signOut.useMutation();

	useEffect(() => {
		if (!PUBLISHABLE_KEY) {
			setIsLoading(false);
			return;
		}

		if (!isQueryLoading) {
			setSession(initialSession ?? null);
			setIsLoading(false);
		}
	}, [initialSession, isQueryLoading]);

	// Listen for session changes from main process
	useEffect(() => {
		if (!PUBLISHABLE_KEY) return;

		const handleSessionChange = (newSession: AuthSession | null) => {
			setSession(newSession);
		};

		window.ipcRenderer.on("auth:session-changed", handleSessionChange);

		return () => {
			window.ipcRenderer.off("auth:session-changed", handleSessionChange);
		};
	}, []);

	const signIn = async () => {
		if (!PUBLISHABLE_KEY) {
			console.warn(
				"[auth] Sign in unavailable - missing VITE_CLERK_PUBLISHABLE_KEY",
			);
			return;
		}
		await signInMutation.mutateAsync();
	};

	const signUp = async () => {
		if (!PUBLISHABLE_KEY) {
			console.warn(
				"[auth] Sign up unavailable - missing VITE_CLERK_PUBLISHABLE_KEY",
			);
			return;
		}
		await signUpMutation.mutateAsync();
	};

	const signOut = async () => {
		if (!PUBLISHABLE_KEY) return;
		await signOutMutation.mutateAsync();
		setSession(null);
	};

	const value: AuthContextValue = {
		session,
		isLoading,
		isAuthenticated: !!session,
		signIn,
		signUp,
		signOut,
	};

	// If no publishable key, provide context without ClerkProvider
	if (!PUBLISHABLE_KEY) {
		return (
			<AuthContext.Provider value={value}>{children}</AuthContext.Provider>
		);
	}

	return (
		<ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
			<AuthContext.Provider value={value}>{children}</AuthContext.Provider>
		</ClerkProvider>
	);
}
