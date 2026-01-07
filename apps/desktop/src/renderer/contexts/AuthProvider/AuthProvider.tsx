import { createContext, type ReactNode, useContext } from "react";
import type { RouterOutputs } from "../../lib/trpc";
import { trpc } from "../../lib/trpc";

interface AuthContextValue {
	token: string | null;
	session: RouterOutputs["auth"]["onAuthState"] | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const { data: authState } = trpc.auth.onAuthState.useSubscription();

	const token = authState?.token ?? null;
	const session = authState ?? null;

	const value: AuthContextValue = {
		token,
		session,
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
