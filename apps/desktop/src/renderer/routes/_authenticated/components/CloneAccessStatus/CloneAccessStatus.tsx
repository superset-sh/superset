import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { LuCircleCheck, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { CopyableCommand } from "renderer/routes/_authenticated/components/CopyableCommand";
import {
	GH_AUTH_COMMAND,
	GH_INSTALL_COMMAND,
} from "renderer/utils/classifyCloneError";

/** Mirrors host-service `project.checkCloneAccess` output structurally so the
 * component doesn't depend on the package's export surface. */
export interface CloneAccessResult {
	ok: boolean;
	/** `unreachable` is synthesized client-side when the host can't be
	 * queried at all; the rest come from the host's classification. */
	reason?: "auth" | "not_found" | "network" | "unreachable" | "unknown";
	detail?: string;
	ghCli: "authenticated" | "unauthenticated" | "not_installed" | "unknown";
}

interface CloneAccessStatusProps {
	/** null while the host hasn't answered (or doesn't support the check). */
	result: CloneAccessResult | null;
	isChecking: boolean;
	hostName: string;
	isRemoteTarget: boolean;
	onRecheck: () => void;
	/** Local target only: open the in-app gh sign-in terminal. */
	onSignIn?: (mode: "auth" | "install") => void;
	/**
	 * `panel` is the settings modal's full treatment (headline + body).
	 * `inline` is one row for the composer: a single sentence, the command
	 * when one fixes it, and a recheck link.
	 */
	variant?: "panel" | "inline";
}

function failureHeadline(result: CloneAccessResult, hostName: string): string {
	switch (result.reason) {
		case "auth":
			return `GitHub sign-in needed on ${hostName}`;
		case "not_found":
			return `${hostName} can't access this repository`;
		case "network":
			return `Can't reach the repository from ${hostName}`;
		case "unreachable":
			return `Can't reach ${hostName}`;
		default:
			return "Couldn't verify repository access";
	}
}

function failureBody(
	result: CloneAccessResult,
	hostName: string,
	isRemoteTarget: boolean,
): string | null {
	const install = result.ghCli === "not_installed";
	switch (result.reason) {
		case "auth":
		case "not_found": {
			if (!isRemoteTarget) {
				return install
					? "Install GitHub CLI and sign in to give this device access."
					: "Sign in to GitHub to give this device access.";
			}
			const fix = install
				? `Install GitHub CLI on ${hostName}, then check again:`
				: `Sign in to GitHub on ${hostName}, then check again:`;
			return result.reason === "not_found" ? `Private repo? ${fix}` : fix;
		}
		case "network":
			return "Check the host's connection, then check again.";
		case "unreachable":
			return "Check that the host is online, then check again.";
		default:
			return null;
	}
}

/** One sentence for the inline row: what's wrong and what fixes it. */
function failureSentence(result: CloneAccessResult, hostName: string): string {
	const install = result.ghCli === "not_installed";
	switch (result.reason) {
		case "auth":
			return install
				? `Install GitHub CLI on ${hostName}:`
				: `Sign in to GitHub on ${hostName}:`;
		case "not_found":
			return install
				? `${hostName} can't see this repo. Private? Install GitHub CLI there:`
				: `${hostName} can't see this repo. Private? Sign in to GitHub there:`;
		case "network":
			return `${hostName} can't reach GitHub. Check its connection.`;
		case "unreachable":
			return `Can't reach ${hostName}. Check it's online.`;
		default:
			return "Couldn't verify access to this repo.";
	}
}

export function CloneAccessStatus({
	result,
	isChecking,
	hostName,
	isRemoteTarget,
	onRecheck,
	onSignIn,
	variant = "panel",
}: CloneAccessStatusProps) {
	const inline = variant === "inline";
	// Any in-flight check shows as checking — rendering the previous result
	// while a recheck runs flashes a stale verdict (green over a now-broken
	// host, or vice versa) exactly when the user is watching closest.
	if (isChecking) {
		return (
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Spinner className="size-3 shrink-0" />
				{inline
					? "Checking access…"
					: `Checking repository access on ${hostName}…`}
			</div>
		);
	}
	if (!result) return null;

	if (result.ok) {
		return (
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<LuCircleCheck className="size-3 shrink-0 text-emerald-500" />
				{inline ? "Access verified" : `${hostName} can access this repository.`}
			</div>
		);
	}

	const needsGhAuth = result.reason === "auth" || result.reason === "not_found";
	const ghNotInstalled = result.ghCli === "not_installed";
	const command = ghNotInstalled ? GH_INSTALL_COMMAND : GH_AUTH_COMMAND;

	if (inline) {
		return (
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
				<span className="flex items-center gap-1.5">
					<LuTriangleAlert className="size-3 shrink-0" />
					{failureSentence(result, hostName)}
				</span>
				{needsGhAuth && !isRemoteTarget && onSignIn ? (
					<Button
						type="button"
						variant="link"
						size="sm"
						className="h-auto p-0 text-xs text-foreground"
						onClick={() => onSignIn(ghNotInstalled ? "install" : "auth")}
					>
						{ghNotInstalled ? "Install GitHub CLI…" : "Sign in to GitHub…"}
					</Button>
				) : needsGhAuth ? (
					<CopyableCommand command={command} size="sm" />
				) : null}
				{result.reason === "unknown" && result.detail && (
					<span className="select-text cursor-text truncate font-mono text-[11px] text-muted-foreground">
						{result.detail}
					</span>
				)}
				<Button
					type="button"
					variant="link"
					size="sm"
					className="h-auto gap-1 p-0 text-xs text-muted-foreground"
					onClick={onRecheck}
				>
					<LuRefreshCw className="size-3" />
					Check again
				</Button>
			</div>
		);
	}

	const body = failureBody(result, hostName, isRemoteTarget);

	return (
		<div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
			<div className="flex items-start gap-2">
				<LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
				<div className="min-w-0 flex-1 space-y-1">
					<p className="text-sm font-medium">
						{failureHeadline(result, hostName)}
					</p>
					{body && <p className="text-xs text-muted-foreground">{body}</p>}
					{/* The raw git line only earns its place when we couldn't
					    classify the failure ourselves. */}
					{result.reason === "unknown" && result.detail && (
						<p className="select-text cursor-text break-all font-mono text-xs text-muted-foreground">
							{result.detail}
						</p>
					)}
				</div>
			</div>
			{needsGhAuth && isRemoteTarget && <CopyableCommand command={command} />}
			<div className="flex items-center gap-2">
				{needsGhAuth && !isRemoteTarget && onSignIn && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => onSignIn(ghNotInstalled ? "install" : "auth")}
					>
						{ghNotInstalled ? "Install GitHub CLI…" : "Sign in to GitHub…"}
					</Button>
				)}
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={onRecheck}
					disabled={isChecking}
				>
					<LuRefreshCw className="size-3.5" />
					Check again
				</Button>
			</div>
		</div>
	);
}
