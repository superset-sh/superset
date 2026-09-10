import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LuCircleCheck } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CopyableCommand } from "renderer/routes/_authenticated/components/CopyableCommand";

const INSTALL_COMMAND = "brew install superset-sh/tap/superset";
/** Browser sign-in on the host; only shown if minting a key for it fails. */
const FALLBACK_START_COMMAND = "superset auth login && superset start --daemon";

function keyName(): string {
	const date = new Date().toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
	return `Host setup ${date}`;
}

/**
 * One paste that signs the host in and starts it, so the other machine never
 * needs a browser or a trip to the API keys page.
 */
function startCommand(apiKey: string, organizationId: string): string {
	return `superset auth login --api-key ${apiKey} --organization ${organizationId} && superset start --daemon`;
}

/**
 * The command's shape before a key exists. A bracketed slot reads as "fill
 * this in", and if it is ever pasted anyway the shell errors on `<` at parse
 * time rather than running a command with an empty key.
 */
function placeholderCommand(organizationId: string | null): string {
	return startCommand("<your-key>", organizationId ?? "\u2026");
}

/** Poll fast while this guide is on screen so the new host lands live. */
const HOST_POLL_INTERVAL_MS = 5_000;

export function AddHostGuide() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	// The org THIS window is showing: the key is minted for the org whose
	// hosts the guide is adding to, not whatever another window last chose.
	const organizationId = useActiveOrganizationId();
	// Minted only when asked. Opening a settings page is not consent to create
	// a credential, and a key the user pressed a button for needs none of the
	// was-it-really-wanted cleanup that an automatic one does.
	const [minted, setMinted] = useState<{ key: string } | null>(null);
	const [minting, setMinting] = useState(false);
	const [mintFailed, setMintFailed] = useState(false);

	const generate = () => {
		if (!organizationId || minting) return;
		setMinting(true);
		apiTrpcClient.apiKey.create
			.mutate({ name: keyName() })
			.then((result) => {
				setMinted(result);
				void utils.apiKey.list.invalidate();
			})
			.catch(() => setMintFailed(true))
			.finally(() => setMinting(false));
	};

	const { data: hosts } = cloudTrpc.v2Host.list.useQuery(undefined, {
		refetchInterval: HOST_POLL_INTERVAL_MS,
		// The user is typically off in a terminal on the other machine while
		// this page waits — keep listening even when the window isn't focused.
		refetchIntervalInBackground: true,
	});

	// Hosts present when the guide loaded are not "the one you just added" —
	// only a machine that appears afterwards ends the flow.
	const initialIdsRef = useRef<Set<string> | null>(null);
	useEffect(() => {
		if (!hosts) return;
		if (initialIdsRef.current === null) {
			initialIdsRef.current = new Set(hosts.map((host) => host.machineId));
			return;
		}
		const added = hosts.find(
			(host) => !initialIdsRef.current?.has(host.machineId),
		);
		if (!added) return;
		// The host itself is the confirmation. Landing on it beats reporting
		// success on a page the user then has to click out of.
		void navigate({
			to: "/settings/hosts/$hostId",
			params: { hostId: added.machineId },
		});
	}, [hosts, navigate]);

	const useFallback = mintFailed || !organizationId;

	return (
		<div className="flex min-h-full items-center justify-center p-6">
			<div className="w-full max-w-xl select-text">
				<h2 className="text-xl font-semibold">
					<Trans>Add a host</Trans>
				</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					<Trans>
						A workspace lives on the machine that hosts its files, terminals,
						and ports. Add a Mac mini, a spare laptop, or a server, and run
						workspaces on it from here.
					</Trans>
				</p>

				<ol className="mt-6 space-y-5">
					<li className="space-y-2">
						<p className="text-sm font-medium">
							<Trans>1. Install the Superset CLI on the other machine</Trans>
						</p>
						<CopyableCommand command={INSTALL_COMMAND} />
					</li>
					<li className="space-y-2">
						<p className="text-sm font-medium">
							<Trans>2. Generate a key for it</Trans>
						</p>
						{/* Caption and button both hold their place across the mint so
						    the steps below don't jump. */}
						<p className="text-xs text-muted-foreground">
							<Trans>
								Lets the other machine sign in without a browser. Revoke it
								anytime under{" "}
								<Link
									to="/settings/api-keys"
									className="underline underline-offset-2 hover:text-foreground"
								>
									API keys
								</Link>
								.
							</Trans>
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={generate}
							disabled={minting || useFallback || minted !== null}
						>
							{minting && <Spinner className="size-3 shrink-0" />}
							{minted && (
								<LuCircleCheck className="size-3.5 shrink-0 text-emerald-500" />
							)}
							{minted ? <Trans>Generated</Trans> : <Trans>Generate key</Trans>}
						</Button>
					</li>
					<li className="space-y-2">
						<p className="text-sm font-medium">
							<Trans>3. Start the host there</Trans>
						</p>
						{useFallback ? (
							<>
								<CopyableCommand command={FALLBACK_START_COMMAND} />
								<p className="text-xs text-muted-foreground">
									<Trans>
										Couldn&apos;t create a key for this host, so this signs in
										through the browser on that machine.
									</Trans>
								</p>
							</>
						) : (
							<CopyableCommand
								command={
									minted && organizationId
										? startCommand(minted.key, organizationId)
										: placeholderCommand(organizationId)
								}
								disabled={!minted}
								disabledHint={t({ message: "Generate a key first" })}
							/>
						)}
					</li>
					<li className="space-y-2">
						<p className="text-sm font-medium">
							<Trans>4. Come back here</Trans>
						</p>
						{/* Detection is best-effort — a host that registers before this
						    page's first fetch lands in the baseline and never reads as
						    new. Say where it shows up so a miss isn't a dead end. */}
						<p className="text-xs text-muted-foreground">
							<Trans>
								The new host appears under Hosts on the left. This page opens it
								as soon as it connects.
							</Trans>
						</p>
					</li>
				</ol>
			</div>
		</div>
	);
}
