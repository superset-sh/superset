import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuCircleCheck } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
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
 * One paste that signs the host in and starts it: the key is minted here so
 * the other machine never needs a browser or a trip to the API keys page.
 */
function startCommand(apiKey: string, organizationId: string): string {
	return `superset auth login --api-key ${apiKey} --organization ${organizationId} && superset start --daemon`;
}

/** Poll fast while this guide is on screen so the new host flips in live. */
const HOST_POLL_INTERVAL_MS = 5_000;

export function AddHostGuide() {
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	// Minted once per visit. Every open would otherwise leave a key behind, so
	// one that was never copied and never saw a host connect is revoked on the
	// way out; a copied key stays, since the paste may still be in flight.
	const [minted, setMinted] = useState<{ id: string; key: string } | null>(
		null,
	);
	const [mintFailed, setMintFailed] = useState(false);
	const mintStartedRef = useRef(false);
	const keyUsedRef = useRef(false);
	// Set when the guide unmounts; a mint still in flight then revokes its own
	// result on arrival instead of leaving an orphan.
	const abandonedRef = useRef(false);
	const revoke = useCallback(
		(id: string) => {
			void authClient.apiKey
				.delete({ keyId: id })
				.then(() => utils.apiKey.list.invalidate())
				.catch(() => undefined);
		},
		[utils],
	);
	useEffect(() => {
		// A re-run setup (dev double-invoke) means we're still mounted.
		abandonedRef.current = false;
		if (!organizationId || mintStartedRef.current) return;
		mintStartedRef.current = true;
		apiTrpcClient.apiKey.create
			.mutate({ name: keyName() })
			.then((result) => {
				if (abandonedRef.current && !keyUsedRef.current) {
					revoke(result.id);
					return;
				}
				setMinted(result);
				void utils.apiKey.list.invalidate();
			})
			.catch(() => setMintFailed(true));
	}, [organizationId, revoke, utils]);
	const mintedRef = useRef(minted);
	mintedRef.current = minted;
	useEffect(() => {
		return () => {
			abandonedRef.current = true;
			const current = mintedRef.current;
			if (current && !keyUsedRef.current) revoke(current.id);
		};
	}, [revoke]);

	const { data: hosts } = cloudTrpc.v2Host.list.useQuery(undefined, {
		refetchInterval: HOST_POLL_INTERVAL_MS,
		// The user is typically off in a terminal on the other machine while
		// this page waits — keep listening even when the window isn't focused.
		refetchIntervalInBackground: true,
	});

	// Hosts present when the guide first loaded are not "the one you just
	// added" — only a machine that appears after that counts as the success.
	const initialIdsRef = useRef<Set<string> | null>(null);
	useEffect(() => {
		if (!hosts || initialIdsRef.current !== null) return;
		initialIdsRef.current = new Set(hosts.map((host) => host.machineId));
	}, [hosts]);
	const newHost =
		hosts?.find(
			(host) =>
				initialIdsRef.current !== null &&
				!initialIdsRef.current.has(host.machineId),
		) ?? null;
	if (newHost) keyUsedRef.current = true;

	return (
		<div
			className="mx-auto w-full max-w-xl p-6 select-text"
			// Selecting the command by hand and copying counts as using the key.
			onCopy={() => {
				keyUsedRef.current = true;
			}}
		>
			<h2 className="text-xl font-semibold">Add a host</h2>
			<p className="mt-2 text-sm text-muted-foreground">
				A workspace lives on the machine that hosts its files, terminals, and
				ports. Add a Mac mini, a spare laptop, or a server, and run workspaces
				on it from here.
			</p>

			<ol className="mt-6 space-y-5">
				<li className="space-y-2">
					<p className="text-sm font-medium">
						1. Install the Superset CLI on the other machine
					</p>
					<CopyableCommand command={INSTALL_COMMAND} />
				</li>
				<li className="space-y-2">
					<p className="text-sm font-medium">2. Start the host there</p>
					{minted && organizationId ? (
						<>
							<CopyableCommand
								command={startCommand(minted.key, organizationId)}
								onCopy={() => {
									keyUsedRef.current = true;
								}}
							/>
							<p className="text-xs text-muted-foreground">
								Signs in with a key made just now for this host. Revoke it
								anytime under{" "}
								<Link
									to="/settings/api-keys"
									className="underline underline-offset-2 hover:text-foreground"
								>
									API keys
								</Link>
								.
							</p>
						</>
					) : mintFailed || !organizationId ? (
						<>
							<CopyableCommand command={FALLBACK_START_COMMAND} />
							<p className="text-xs text-muted-foreground">
								Couldn't create a key for this host, so this signs in through
								the browser on that machine.
							</p>
						</>
					) : (
						<div className="flex h-[34px] items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground">
							<Spinner className="size-3 shrink-0" />
							Preparing a key for this host…
						</div>
					)}
				</li>
				<li className="space-y-2">
					<p className="text-sm font-medium">3. That&apos;s it</p>
					{newHost ? (
						<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
							<div className="flex min-w-0 items-center gap-2">
								<LuCircleCheck className="size-4 shrink-0 text-emerald-500" />
								<p className="truncate text-sm">
									<span className="font-medium">{newHost.name}</span> is
									connected.
								</p>
							</div>
							<Button
								type="button"
								size="sm"
								onClick={() => {
									void navigate({
										to: "/settings/hosts/$hostId",
										params: { hostId: newHost.machineId },
									});
								}}
							>
								Open host settings
							</Button>
						</div>
					) : (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Spinner className="size-3.5 shrink-0" />
							Waiting for the host to come online. It appears here
							automatically.
						</div>
					)}
				</li>
			</ol>

			<p className="mt-8 text-xs text-muted-foreground">
				Prefer a dedicated machine over your main workstation: everything the
				host can reach (files, terminals, agent runs) becomes reachable by the
				devices you grant access to.
			</p>
		</div>
	);
}
