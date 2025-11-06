import { Button } from "@superset/ui/button";
import { Loader2, MonitorSmartphone, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tab, Worktree } from "shared/types";
import { BrowserView, type BrowserViewRef } from "./components/BrowserView";

interface ProxyStatus {
	canonical: number;
	target?: number;
	service?: string;
	active: boolean;
}

interface PreviewTabProps {
	tab: Tab;
	workspaceId: string;
	worktreeId?: string;
	worktree?: Worktree;
}

const normalizeUrl = (value: string): string => {
	let url = value.trim();

	// Strip wrapping quotes that often come from copy/paste
	url = url.replace(/^['"]+|['"]+$/g, "");

	if (url === "") {
		return url;
	}

	// Handle bare port numbers (e.g. "3000")
	if (/^\d+$/.test(url)) {
		return `http://localhost:${url}`;
	}

	// Handle ":3000" or "localhost:3000"
	if (/^:\d+/.test(url)) {
		return `http://localhost${url}`;
	}

	if (/^localhost:\d+/.test(url)) {
		return `http://${url}`;
	}

	// Prefix protocol if missing
	if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) {
		const lower = url.toLowerCase();
		const isLocalhost =
			lower.startsWith("localhost") ||
			lower.startsWith("127.") ||
			lower.startsWith("0.0.0.0") ||
			lower.startsWith("[::1]");
		const isIPv4 = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(lower);
		const isIPv6 = lower.includes("::") || lower.startsWith("[");
		const protocol = isLocalhost || isIPv4 || isIPv6 ? "http" : "https";
		return `${protocol}://${url}`;
	}

	return url;
};

export function PreviewTab({
	tab,
	workspaceId,
	worktreeId,
	worktree,
}: PreviewTabProps) {
	const browserViewRef = useRef<BrowserViewRef>(null);
	const initializedRef = useRef(false);
	const lastPersistedUrlRef = useRef<string | undefined>(tab.url);

	// Initialize state from tab.url prop (single source of truth from workspace)
	const [addressBarValue, setAddressBarValue] = useState(() => tab.url ?? "");
	const [currentUrl, setCurrentUrl] = useState(() => tab.url ?? "");

	const [isLoading, setIsLoading] = useState(false);
	const [proxyStatus, setProxyStatus] = useState<ProxyStatus[]>([]);

	const detectedPorts = worktree?.detectedPorts || {};
	const portEntries = useMemo(
		() => Object.entries(detectedPorts),
		[detectedPorts],
	);

	const activeProxies = useMemo(
		() => proxyStatus.filter((p) => p.active && p.target),
		[proxyStatus],
	);

	const proxyMap = useMemo(() => {
		return new Map(activeProxies.map((p) => [p.target, p.canonical]));
	}, [activeProxies]);

	const resolvePortUrl = useCallback(
		(port: number) => {
			const canonicalPort = proxyMap.get(port);
			const targetPort = canonicalPort ?? port;
			return `http://localhost:${targetPort}`;
		},
		[proxyMap],
	);

	const persistUrl = useCallback(
		async (url: string) => {
			if (!workspaceId || !worktreeId) {
				return;
			}

			if (url === lastPersistedUrlRef.current) {
				return;
			}

			lastPersistedUrlRef.current = url;

			try {
				await window.ipcRenderer.invoke("tab-update-preview", {
					workspaceId,
					worktreeId,
					tabId: tab.id,
					url,
				});
			} catch (error) {
				console.error("Failed to persist preview URL:", error);
			}
		},
		[tab.id, worktreeId, workspaceId],
	);

	const navigateTo = useCallback(
		(url: string, options?: { persist?: boolean }) => {
			const normalized = normalizeUrl(url);

			setCurrentUrl(normalized);
			setAddressBarValue(normalized);

			if (options?.persist !== false) {
				void persistUrl(normalized);
			}
		},
		[persistUrl],
	);

	const handleSubmit = useCallback(
		(event: React.FormEvent) => {
			event.preventDefault();
			if (addressBarValue.trim() === "") return;
			navigateTo(addressBarValue);
		},
		[addressBarValue, navigateTo],
	);

	const handleUrlChange = useCallback(
		(newUrl: string) => {
			setCurrentUrl(newUrl);
			setAddressBarValue(newUrl);
			void persistUrl(newUrl);
		},
		[persistUrl],
	);

	const handleLoadingChange = useCallback((loading: boolean) => {
		setIsLoading(loading);
	}, []);

	const handleSelectPort = useCallback(
		(event: React.ChangeEvent<HTMLSelectElement>) => {
			const value = event.target.value;
			if (!value) return;
			navigateTo(value);
		},
		[navigateTo],
	);

	// Fetch proxy status periodically to keep canonical port mappings fresh
	useEffect(() => {
		let isMounted = true;

		const fetchProxyStatus = async () => {
			try {
				const status = await window.ipcRenderer.invoke("proxy-get-status");
				if (isMounted) {
					setProxyStatus(status || []);
				}
			} catch (error) {
				console.error("Failed to fetch proxy status:", error);
			}
		};

		void fetchProxyStatus();
		const interval = setInterval(fetchProxyStatus, 5000);

		return () => {
			isMounted = false;
			clearInterval(interval);
		};
	}, []);

	// Initialize default URL from detected ports if no URL is set
	useEffect(() => {
		if (initializedRef.current) {
			return;
		}

		const initialize = () => {
			// If tab already has a URL, the webview src will handle it
			if (tab.url && tab.url.trim() !== "") {
				initializedRef.current = true;
				return;
			}

			// Fallback to first detected port
			const firstEntry = portEntries[0];
			if (firstEntry) {
				const [, port] = firstEntry;
				const resolved = resolvePortUrl(port);
				navigateTo(resolved, { persist: true });
			}

			initializedRef.current = true;
		};

		initialize();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Only run once on mount

	// Note: We don't sync tab.url changes after mount because state is the source of truth
	// State gets persisted to backend, which updates tab.url, creating a feedback loop

	const portOptions = useMemo(() => {
		return portEntries.map(([service, port]) => {
			const url = resolvePortUrl(port);
			return {
				service,
				port,
				url,
				label: service ? `${service} (${url})` : url,
			};
		});
	}, [portEntries, resolvePortUrl]);

	const showPlaceholder = currentUrl.trim() === "";

	return (
		<div className="flex h-full flex-col bg-neutral-950 text-neutral-50">
			<div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => browserViewRef.current?.reload()}
					disabled={!currentUrl}
					className="h-8 w-8"
				>
					<RotateCw
						size={16}
						className={isLoading ? "animate-spin text-blue-400" : ""}
					/>
				</Button>

				<form
					onSubmit={handleSubmit}
					className="flex flex-1 items-center gap-2"
				>
					<div className="flex flex-1 items-center gap-2 rounded-md bg-neutral-900 px-2 py-1 ring-1 ring-inset ring-neutral-800 focus-within:ring-blue-500">
						<MonitorSmartphone size={16} className="text-neutral-400" />
						<input
							type="text"
							value={addressBarValue}
							onChange={(event) => setAddressBarValue(event.target.value)}
							className="flex-1 border-none bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
							placeholder="Enter URL or port (e.g. localhost:3000)"
						/>
					</div>
					<Button type="submit" size="sm" variant="secondary" className="px-3">
						Go
					</Button>
				</form>

				{portOptions.length > 0 && (
					<select
						onChange={handleSelectPort}
						defaultValue=""
						className="h-8 rounded-md border border-neutral-800 bg-neutral-900 px-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
					>
						<option value="">Detected Ports</option>
						{portOptions.map((option) => (
							<option
								key={`${option.service}-${option.port}`}
								value={option.url}
							>
								{option.label}
							</option>
						))}
					</select>
				)}
			</div>

			<div className="relative flex-1 bg-neutral-900">
				{showPlaceholder ? (
					<div className="flex h-full flex-col items-center justify-center gap-4 text-center text-neutral-400">
						<div className="flex items-center gap-3 text-sm">
							<MonitorSmartphone size={28} className="text-neutral-500" />
							<div className="max-w-xs text-left space-y-1">
								<p className="font-medium text-neutral-200">
									No preview URL configured yet.
								</p>
								<p className="text-xs text-neutral-400">
									Start a dev server or enter a URL above to load the preview.
								</p>
							</div>
						</div>

						{portOptions.length > 0 && (
							<div className="flex flex-wrap justify-center gap-2">
								{portOptions.slice(0, 3).map((option) => (
									<Button
										key={option.url}
										variant="outline"
										size="sm"
										onClick={() => navigateTo(option.url)}
									>
										{option.label}
									</Button>
								))}
							</div>
						)}
					</div>
				) : (
					<>
						{isLoading && (
							<div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2">
								<div className="flex items-center gap-2 rounded-full bg-neutral-800/80 px-3 py-1 text-xs text-neutral-200 shadow-lg">
									<Loader2 size={14} className="animate-spin text-blue-400" />
									<span>Loading preview...</span>
								</div>
							</div>
						)}
						<BrowserView
							ref={browserViewRef}
							tabId={tab.id}
							url={currentUrl}
							onUrlChange={handleUrlChange}
							onLoadingChange={handleLoadingChange}
						/>
					</>
				)}
			</div>
		</div>
	);
}
