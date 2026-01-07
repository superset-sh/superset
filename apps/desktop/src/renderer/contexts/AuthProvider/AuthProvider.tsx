import { createContext, type ReactNode, useContext } from "react";
import type { RouterOutputs } from "../../lib/trpc";
import { trpc } from "../../lib/trpc";

interface AuthContextValue {
	token: string | null;
	session: RouterOutputs["auth"]["onAuthState"] | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provides auth state (token and session) to the component tree.
 * Single subscription to onAuthState - CollectionsProvider uses this to recreate collections.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
	const { data: authState } = trpc.auth.onAuthState.useSubscription();

	const token = authState?.token ?? null;
	// Pass the whole authState (which includes session + user) as "session"
	// This way session.user.email, session.session.activeOrganizationId work
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
