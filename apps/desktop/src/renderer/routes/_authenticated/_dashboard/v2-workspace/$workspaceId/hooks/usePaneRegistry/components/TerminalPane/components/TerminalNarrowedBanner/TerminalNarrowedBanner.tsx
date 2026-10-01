import { Trans } from "@lingui/react/macro";
import { useCallback, useSyncExternalStore } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";

interface TerminalNarrowedBannerProps {
	terminalId: string;
	terminalInstanceId: string;
}

export function TerminalNarrowedBanner({
	terminalId,
	terminalInstanceId,
}: TerminalNarrowedBannerProps) {
	const subscribe = useCallback(
		(callback: () => void) =>
			terminalRuntimeRegistry.onNarrowedChange(
				terminalId,
				callback,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const getSnapshot = useCallback(
		() =>
			terminalRuntimeRegistry.isNarrowedByOtherClient(
				terminalId,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const narrowed = useSyncExternalStore(subscribe, getSnapshot);
	if (!narrowed) return null;

	return (
		<output className="-mx-2 -mt-2 mb-2 flex items-center border-b border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
			<Trans>
				This terminal is also open on a smaller screen, so it's sized to fit
			</Trans>
		</output>
	);
}
