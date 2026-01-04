import { createContext, type ReactNode, useContext, useState } from "react";
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

	trpc.auth.onAccessToken.useSubscription(undefined, {
		onData: (data) => setAccessToken(data.accessToken),
		onError: (err) => {
			console.error("[AuthProvider] Token subscription error:", err);
		},
	});

	if (accessToken === undefined) {
		return null;
	}

	if (accessToken === null) {
		const SignInScreen = require("renderer/screens/sign-in").default;
		return <SignInScreen />;
	}

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
