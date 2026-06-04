"use client";

import { REMOTE_CONTROL_TOKEN_PARAM } from "@superset/shared/remote-control-protocol";
import { useEffect, useState } from "react";
import { RemoteTerminal } from "../RemoteTerminal";

interface RemoteTerminalLoaderProps {
	sessionId: string;
}

function readTokenFromHash(): string | null {
	if (typeof window === "undefined") return null;
	const hash = window.location.hash.replace(/^#/, "");
	if (!hash) return null;
	const params = new URLSearchParams(hash);
	return params.get(REMOTE_CONTROL_TOKEN_PARAM);
}

// Client-side wrapper that pulls the bearer token out of `location.hash`.
// The fragment never travels to the server, so the page itself can't see
// it on first render — we reach the fallback markup, then swap to the
// terminal component once the token is available.
export function RemoteTerminalLoader({ sessionId }: RemoteTerminalLoaderProps) {
	const [token, setToken] = useState<string | null>(null);
	const [resolved, setResolved] = useState(false);

	useEffect(() => {
		setToken(readTokenFromHash());
		setResolved(true);
		const onHashChange = () => setToken(readTokenFromHash());
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	if (!resolved) {
		return (
			<div
				className="flex h-screen items-center justify-center"
				style={{ backgroundColor: "#151110", color: "#eae8e6" }}
			/>
		);
	}

	if (!token) {
		return (
			<div
				className="flex h-screen items-center justify-center"
				style={{ backgroundColor: "#151110", color: "#eae8e6" }}
			>
				<div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-12">
					<h1 className="text-xl font-semibold">Remote control unavailable</h1>
					<p
						className="select-text cursor-text text-sm"
						style={{ color: "#a8a5a3" }}
					>
						This link is missing its access token. Open the share link from the
						original message to view the terminal.
					</p>
				</div>
			</div>
		);
	}

	return <RemoteTerminal sessionId={sessionId} token={token} />;
}
