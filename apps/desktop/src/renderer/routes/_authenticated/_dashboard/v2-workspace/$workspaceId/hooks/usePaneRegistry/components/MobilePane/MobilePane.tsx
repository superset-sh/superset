import { RemoteControl } from "@limrun/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef, useState } from "react";

type Phase = "detecting" | "unavailable" | "starting" | "ready" | "error";

/** Mobile simulator backed by whichever this host can produce: Limrun on a
 * cloud sandbox, or a local iOS/Android simulator on a real machine. */
export function MobilePane() {
	const { t } = useLingui();
	const statusQuery = workspaceTrpc.mobile.status.useQuery();
	const limrunSession = workspaceTrpc.mobile.limrunSession.useMutation();
	const localSession = workspaceTrpc.mobile.localSession.useMutation();
	const [localUrl, setLocalUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const startedBackend = useRef<string | null>(null);

	const backend = statusQuery.data?.backend;

	// Mint/start a session once per backend, not per render (mutations get a
	// new identity every render, so they're excluded from the deps below).
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!backend || backend === "none" || startedBackend.current === backend) {
			return;
		}
		startedBackend.current = backend;
		setError(null);

		if (backend === "limrun") {
			// apps/mobile is iOS-only today (see its own AGENTS.md); a
			// platform picker for a generic Android target is future work.
			limrunSession.mutate(
				{ platform: "ios" },
				{ onError: (err) => setError(errorMessage(err)) },
			);
			return;
		}

		localSession.mutate(
			{ platform: backend },
			{
				onSuccess: (result) => setLocalUrl(result.url),
				onError: (err) => setError(errorMessage(err)),
			},
		);
	}, [backend]);

	const hasSession = backend === "limrun" ? !!limrunSession.data : !!localUrl;

	const phase: Phase = error
		? "error"
		: statusQuery.isPending
			? "detecting"
			: !backend || backend === "none"
				? "unavailable"
				: hasSession
					? "ready"
					: "starting";

	return (
		<div className="relative size-full bg-background">
			{phase === "ready" && backend === "limrun" && limrunSession.data && (
				<RemoteControl
					url={limrunSession.data.endpointWebSocketUrl}
					token={limrunSession.data.token}
					className="size-full"
					onTerminated={() =>
						setError(t({ message: "The simulator instance was terminated." }))
					}
				/>
			)}
			{phase === "ready" &&
				(backend === "local-ios" || backend === "local-android") &&
				localUrl && <webview src={localUrl} className="size-full" />}
			{phase !== "ready" && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/95">
					<div className="max-w-sm px-6 text-center text-sm text-muted-foreground">
						{phase === "detecting" && (
							<Trans>Looking for a mobile simulator…</Trans>
						)}
						{phase === "starting" && <Trans>Starting the simulator…</Trans>}
						{phase === "unavailable" && (
							<Trans>
								No mobile simulator available here. This needs either a
								Limrun-enabled cloud sandbox or a local iOS/Android toolchain.
							</Trans>
						)}
						{phase === "error" && (
							<Trans>Could not reach a mobile simulator.</Trans>
						)}
						{error && <div className="mt-2 text-xs opacity-70">{error}</div>}
					</div>
				</div>
			)}
		</div>
	);
}
