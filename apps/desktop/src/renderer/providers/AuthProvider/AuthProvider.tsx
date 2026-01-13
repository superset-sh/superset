import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { authClient, setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "../../lib/electron-trpc";

interface AuthTokenContextValue {
	token: string | null;
}

const AuthTokenContext = createContext<AuthTokenContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const [token, setToken] = useState<string | null>(null);

	const { data: session } = authClient.useSession();

	const { data: storedToken } = electronTrpc.auth.getStoredToken.useQuery(
		undefined,
		{
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		},
	);

	const persistMutation = electronTrpc.auth.persistToken.useMutation();

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: (data) => {
			if (data?.token && data?.expiresAt) {
				setToken(data.token);
				setAuthToken(data.token);
				persistMutation.mutate({ token: data.token, expiresAt: data.expiresAt });
			}
		},
	});

	useEffect(() => {
		if (storedToken && !isHydrated) {
			if (storedToken.token && storedToken.expiresAt) {
				setToken(storedToken.token);
				setAuthToken(storedToken.token);
			}
			setIsHydrated(true);
		}
	}, [storedToken, isHydrated]);

	useEffect(() => {
		if (token) {
			setAuthToken(token);
		} else {
			setAuthToken(null);
		}
	}, [token]);

	useEffect(() => {
		if (!session?.user && token) {
			setToken(null);
			setAuthToken(null);
		}
	}, [session, token]);

	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return (
		<AuthTokenContext.Provider value={{ token }}>
			{children}
		</AuthTokenContext.Provider>
	);
}

export function useAuthToken(): string | null {
	const context = useContext(AuthTokenContext);
	if (!context) {
		throw new Error("useAuthToken must be used within AuthProvider");
	}
	return context.token;
}
