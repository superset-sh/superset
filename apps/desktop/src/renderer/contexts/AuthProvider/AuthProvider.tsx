import { createContext, type ReactNode, useContext } from "react";
import type { RouterOutputs } from "../../lib/trpc";
import { trpc } from "../../lib/trpc";

type AuthState = RouterOutputs["auth"]["onAuthState"];

interface AuthContextValue {
	token: string | null;
	session: AuthState;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const { data: authState } = trpc.auth.onAuthState.useSubscription();

	const value: AuthContextValue = {
		token: authState?.token ?? null,
		session: authState ?? null,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return context;
}
