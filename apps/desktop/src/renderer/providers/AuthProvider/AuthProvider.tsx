import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import type { RouterOutputs } from "../../lib/trpc";
import { trpc } from "../../lib/trpc";

type AuthState = RouterOutputs["auth"]["onAuthState"];

interface AuthContextValue {
	token: string | null;
	session: AuthState;
	isInitialized: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const { data: authState } = trpc.auth.onAuthState.useSubscription();
	const [isInitialized, setIsInitialized] = useState(false);

	// Mark as initialized once we receive the first auth state
	useEffect(() => {
		if (authState !== undefined && !isInitialized) {
			setIsInitialized(true);
		}
	}, [authState, isInitialized]);

	const value: AuthContextValue = {
		token: authState?.token ?? null,
		session: authState ?? null,
		isInitialized,
	};

	// Show loading spinner until auth state is initialized
	if (!isInitialized) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return context;
}
