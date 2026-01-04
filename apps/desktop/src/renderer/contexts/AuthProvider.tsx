import { createContext, useContext, type ReactNode, useState } from "react";
import { trpc } from "renderer/lib/trpc";

interface AuthContextValue {
	accessToken: string;
	isAuthenticated: true;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [accessToken, setAccessToken] = useState<string | null | undefined>(
		undefined,
	);

	// Subscribe to access token from auth service
	trpc.auth.onAccessToken.useSubscription(undefined, {
		onData: (data) => {
			console.log("[AuthProvider] Access token updated:", {
				hasToken: !!data.accessToken,
				tokenLength: data.accessToken?.length,
			});
			setAccessToken(data.accessToken);
		},
		onError: (err) => {
			console.error("[AuthProvider] Token subscription error:", err);
		},
	});

	// Loading - waiting for first token emission
	if (accessToken === undefined) {
		return null;
	}

	// No token - show sign in screen
	if (accessToken === null) {
		// Import dynamically to avoid circular deps
		const SignInScreen = require("renderer/screens/sign-in").default;
		return <SignInScreen />;
	}

	// Have token - provide to children
	const value: AuthContextValue = {
		accessToken,
		isAuthenticated: true,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return context;
};
