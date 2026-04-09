import type {
	TerminalProxyModeGlobal,
	TerminalProxySettings,
} from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

function getManualValues(settings?: TerminalProxySettings | null) {
	return {
		proxyUrl: settings?.manual?.proxyUrl ?? "",
		noProxy: settings?.manual?.noProxy ?? "",
	};
}

export function TerminalProxySection() {
	const utils = electronTrpc.useUtils();
	const { data: terminalProxySettings } =
		electronTrpc.settings.getTerminalProxySettings.useQuery();

	const [detectedNonce, setDetectedNonce] = useState(0);
	const detectedQuery =
		electronTrpc.settings.getDetectedInheritedProxy.useQuery({
			refresh: detectedNonce > 0,
			nonce: detectedNonce,
		});

	const [mode, setMode] = useState<TerminalProxyModeGlobal>("auto");
	const [proxyUrl, setProxyUrl] = useState("");
	const [noProxy, setNoProxy] = useState("");
	const previousModeRef = useRef<TerminalProxyModeGlobal>("auto");

	useEffect(() => {
		const nextMode = terminalProxySettings?.mode ?? "auto";
		previousModeRef.current = nextMode;
		setMode(nextMode);
		const manual = getManualValues(terminalProxySettings);
		setProxyUrl(manual.proxyUrl);
		setNoProxy(manual.noProxy);
	}, [terminalProxySettings]);

	const setTerminalProxySettings =
		electronTrpc.settings.setTerminalProxySettings.useMutation({
			onSuccess: () => {
				utils.settings.getTerminalProxySettings.invalidate();
			},
			onError: (error) => {
				setMode(previousModeRef.current);
				utils.settings.getTerminalProxySettings.invalidate();
				toast.error("Failed to save terminal proxy settings", {
					description: error.message,
				});
			},
		});

	const canSaveManual = useMemo(
		() => proxyUrl.trim().length > 0 && !setTerminalProxySettings.isPending,
		[proxyUrl, setTerminalProxySettings.isPending],
	);
	const detectedValueFallback = "No values found";

	const handleModeChange = (nextMode: TerminalProxyModeGlobal) => {
		previousModeRef.current = mode;
		setMode(nextMode);

		if (nextMode === "manual") {
			return;
		}

		setTerminalProxySettings.mutate({
			mode: nextMode,
		});
	};

	const saveManual = () => {
		previousModeRef.current = mode;
		setTerminalProxySettings.mutate({
			mode: "manual",
			manual: {
				proxyUrl,
				noProxy,
			},
		});
	};

	return (
		<div className="rounded-md border border-border/60 p-4 space-y-4">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">Terminal Proxy</Label>
				<p className="text-xs text-muted-foreground">
					Configure proxy only for new terminal sessions and agent processes
					launched from those terminals.
				</p>
				<p className="text-xs text-muted-foreground">
					Changes apply only to newly created terminals. Existing terminal
					sessions keep their current environment.
				</p>
			</div>

			<RadioGroup
				value={mode}
				onValueChange={(value) =>
					handleModeChange(value as TerminalProxyModeGlobal)
				}
				disabled={setTerminalProxySettings.isPending}
				className="space-y-2"
			>
				<div className="flex items-start gap-2">
					<RadioGroupItem id="terminal-proxy-auto" value="auto" />
					<div>
						<Label htmlFor="terminal-proxy-auto">Auto (Inherited)</Label>
						<p className="text-xs text-muted-foreground">
							Use proxy variables detected from the environment used to launch
							Superset.
						</p>
					</div>
				</div>
				<div className="flex items-start gap-2">
					<RadioGroupItem id="terminal-proxy-manual" value="manual" />
					<div>
						<Label htmlFor="terminal-proxy-manual">Manual</Label>
						<p className="text-xs text-muted-foreground">
							Use explicitly configured proxy URL for terminal sessions.
						</p>
					</div>
				</div>
				<div className="flex items-start gap-2">
					<RadioGroupItem id="terminal-proxy-disabled" value="disabled" />
					<div>
						<Label htmlFor="terminal-proxy-disabled">Disabled</Label>
						<p className="text-xs text-muted-foreground">
							Force-disable proxy variables for terminal sessions.
						</p>
					</div>
				</div>
			</RadioGroup>

			{mode === "manual" && (
				<div className="space-y-3 rounded-md border border-border/60 p-3">
					<div className="space-y-1">
						<Label htmlFor="terminal-proxy-url">Proxy URL</Label>
						<Input
							id="terminal-proxy-url"
							value={proxyUrl}
							onChange={(event) => setProxyUrl(event.target.value)}
							placeholder="http://proxy.example.com:8080"
							disabled={setTerminalProxySettings.isPending}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="terminal-no-proxy">No proxy (CSV)</Label>
						<Input
							id="terminal-no-proxy"
							value={noProxy}
							onChange={(event) => setNoProxy(event.target.value)}
							placeholder="localhost,127.0.0.1,.internal.example.com"
							disabled={setTerminalProxySettings.isPending}
						/>
					</div>
					<div className="flex justify-end">
						<Button size="sm" onClick={saveManual} disabled={!canSaveManual}>
							Save Manual Proxy
						</Button>
					</div>
				</div>
			)}

			<div className="rounded-md border border-border/60 p-3 space-y-2">
				<div className="flex items-center justify-between">
					<Label className="text-sm font-medium">
						Inherited proxy from app environment (read-only)
					</Label>
					<Button
						size="sm"
						variant="ghost"
						disabled={detectedQuery.isFetching}
						onClick={() => setDetectedNonce((value) => value + 1)}
					>
						Refresh detected environment
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					These values are inherited from the environment used to launch
					Superset.
				</p>
				<div className="rounded-md border border-border/70 bg-muted/30 p-2.5">
					<div className="text-xs font-mono space-y-1 opacity-70">
						<div>
							HTTP_PROXY=
							{detectedQuery.data?.httpProxy || detectedValueFallback}
						</div>
						<div>
							HTTPS_PROXY=
							{detectedQuery.data?.httpsProxy || detectedValueFallback}
						</div>
						<div>
							NO_PROXY=
							{detectedQuery.data?.noProxy || detectedValueFallback}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
