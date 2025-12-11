import type React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AuthSession } from "shared/ipc-channels/auth";
import { trpc } from "../../lib/trpc";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface AuthContextValue {
	session: AuthSession | null;
	isLoading: boolean;
	isSigningIn: boolean;
	isAuthenticated: boolean;
	signIn: () => Promise<void>;
	signUp: () => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook to access auth state and actions.
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
 * Auth provider that manages authentication state via the main process.
 * Authentication happens in a BrowserWindow popup, not in the renderer.
 */
export function AuthProvider({ children }: AuthProviderProps) {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [isLoading, setIsLoading] = useState(!!PUBLISHABLE_KEY);
	const [isSigningIn, setIsSigningIn] = useState(false);
	const signingInRef = useRef(false);

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
			console.log("[auth-renderer] Session changed:", newSession);
			setSession(newSession);
			// Always clear signing in state when we receive a session update
			if (signingInRef.current) {
				signingInRef.current = false;
				setIsSigningIn(false);
			}
		};

		const handleWindowClosed = () => {
			// Auth window was closed - clear signing in state regardless of outcome
			console.log("[auth-renderer] Auth window closed");
			if (signingInRef.current) {
				signingInRef.current = false;
				setIsSigningIn(false);
			}
		};

		window.ipcRenderer.on("auth:session-changed", handleSessionChange);
		window.ipcRenderer.on("auth:window-closed", handleWindowClosed);

		return () => {
			window.ipcRenderer.off("auth:session-changed", handleSessionChange);
			window.ipcRenderer.off("auth:window-closed", handleWindowClosed);
		};
	}, []);

	// Also clear isSigningIn when session becomes truthy
	useEffect(() => {
		if (session && isSigningIn) {
			setIsSigningIn(false);
			signingInRef.current = false;
		}
	}, [session, isSigningIn]);

	const signIn = async () => {
		if (!PUBLISHABLE_KEY) {
			console.warn(
				"[auth] Sign in unavailable - missing VITE_CLERK_PUBLISHABLE_KEY",
			);
			return;
		}
		signingInRef.current = true;
		setIsSigningIn(true);
		try {
			const result = await signInMutation.mutateAsync();
			if (!result.success) {
				console.error("[auth] Sign in failed:", result.error);
				signingInRef.current = false;
				setIsSigningIn(false);
			}
		} catch (error) {
			console.error("[auth] Sign in error:", error);
			signingInRef.current = false;
			setIsSigningIn(false);
		}
	};

	const signUp = async () => {
		if (!PUBLISHABLE_KEY) {
			console.warn(
				"[auth] Sign up unavailable - missing VITE_CLERK_PUBLISHABLE_KEY",
			);
			return;
		}
		signingInRef.current = true;
		setIsSigningIn(true);
		try {
			const result = await signUpMutation.mutateAsync();
			if (!result.success) {
				console.error("[auth] Sign up failed:", result.error);
				signingInRef.current = false;
				setIsSigningIn(false);
			}
		} catch (error) {
			console.error("[auth] Sign up error:", error);
			signingInRef.current = false;
			setIsSigningIn(false);
		}
	};

	const signOut = async () => {
		if (!PUBLISHABLE_KEY) return;
		await signOutMutation.mutateAsync();
		setSession(null);
	};

	const value: AuthContextValue = {
		session,
		isLoading,
		isSigningIn,
		isAuthenticated: !!session,
		signIn,
		signUp,
		signOut,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
