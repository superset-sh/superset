import { RemoteControl } from "@limrun/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useState } from "react";
import { LocalDevices } from "./components/LocalDevices";

/** Mobile simulator backed by whichever this host can produce: Limrun on a
 * cloud sandbox, or a local iOS/Android simulator on a real machine. */
export function MobilePane() {
	const { t } = useLingui();
	const statusQuery = workspaceTrpc.mobile.status.useQuery();
	const limrunSession = workspaceTrpc.mobile.limrunSession.useMutation();
	const [terminated, setTerminated] = useState(false);

	const backend = statusQuery.data?.backend;
	const startLimrun = limrunSession.mutate;

	useEffect(() => {
		// apps/mobile is iOS-only today (see its own AGENTS.md); a
		// platform picker for a generic Android target is future work.
		if (backend === "limrun") startLimrun({ platform: "ios" });
	}, [backend, startLimrun]);

	if (backend === "local-ios" || backend === "local-android") {
		return (
			<div className="size-full bg-background">
				<LocalDevices />
			</div>
		);
	}

	const session = terminated ? null : limrunSession.data;
	const error = terminated
		? t({ message: "The simulator instance was terminated." })
		: limrunSession.error
			? errorMessage(limrunSession.error)
			: null;

	return (
		<div className="relative size-full bg-background">
			{session ? (
				<RemoteControl
					url={session.endpointWebSocketUrl}
					token={session.token}
					className="size-full"
					onTerminated={() => setTerminated(true)}
				/>
			) : (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="max-w-sm px-6 text-center text-sm text-muted-foreground">
						{error ? (
							<Trans>Could not reach a mobile simulator.</Trans>
						) : statusQuery.isPending ? (
							<Trans>Looking for a mobile simulator…</Trans>
						) : backend === "limrun" ? (
							<Trans>Starting the simulator…</Trans>
						) : (
							<Trans>
								No mobile simulator available here. This needs either a
								Limrun-enabled cloud sandbox or a local iOS/Android toolchain.
							</Trans>
						)}
						{error && <div className="mt-2 text-xs opacity-70">{error}</div>}
					</div>
				</div>
			)}
		</div>
	);
}
