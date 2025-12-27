import {
	PGliteProvider as BasePGliteProvider,
	usePGlite,
} from "@electric-sql/pglite-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { database, type PGliteWithExtensions } from "./database";
import { startSync } from "./sync";

export { usePGlite };

export function PGliteProvider({ children }: { children: ReactNode }) {
	const [pg, setPg] = useState<PGliteWithExtensions | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const syncRef = useRef<{ unsubscribe: () => void } | null>(null);

	useEffect(() => {
		database.then(({ pg }) => setPg(pg)).catch((err) => setError(err.message));
	}, []);

	trpc.auth.onAccessToken.useSubscription(undefined, {
		onData: ({ accessToken }) => setAccessToken(accessToken),
	});

	useEffect(() => {
		if (pg && accessToken) {
			syncRef.current?.unsubscribe();
			startSync(pg, accessToken).then((sync) => {
				syncRef.current = sync;
			});
		}
		return () => syncRef.current?.unsubscribe();
	}, [pg, accessToken]);

	if (error) {
		return <div className="p-4 text-destructive">Database error: {error}</div>;
	}

	if (!pg) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return <BasePGliteProvider db={pg}>{children}</BasePGliteProvider>;
}
