import { Button } from "@superset/ui/button";
import { Loader2, MonitorSmartphone, RotateCw } from "lucide-react";
import type { WebviewTag } from "electron";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Tab, Worktree } from "shared/types";

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
		return `http://${url}`;
	}

	return url;
};

export function PreviewTab({
	tab,
	workspaceId,
	worktreeId,
	worktree,
}: PreviewTabProps) {
	const webviewRef = useRef<WebviewTag | null>(null);
	const initializedRef = useRef(false);
	const lastPersistedUrlRef = useRef<string | undefined>(tab.url);
	const [addressBarValue, setAddressBarValue] = useState(tab.url ?? "");
	const [currentUrl, setCurrentUrl] = useState(tab.url ?? "");
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

			if (lastPersistedUrlRef.current === url) {
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

			if (webviewRef.current && normalized) {
				try {
					if (webviewRef.current.getURL() !== normalized) {
						webviewRef.current.loadURL(normalized);
					}
				} catch (error) {
					console.error("Failed to load preview URL:", error);
				}
			}

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

	const handleReload = useCallback(() => {
		if (!webviewRef.current) return;
		try {
			webviewRef.current.reload();
		} catch (error) {
			console.error("Failed to reload preview:", error);
		}
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

	// Initialize default URL from tab data or detected ports
	useEffect(() => {
		if (initializedRef.current) {
			return;
		}

		const initialize = async () => {
			if (tab.url && tab.url.trim() !== "") {
				setCurrentUrl(tab.url);
				setAddressBarValue(tab.url);
				initializedRef.current = true;
				return;
			}

			const firstEntry = portEntries[0];
			if (!firstEntry) {
				return;
			}

			const [, port] = firstEntry;
			const resolved = resolvePortUrl(port);
			navigateTo(resolved, { persist: true });
			initializedRef.current = true;
		};

		void initialize();
	}, [navigateTo, portEntries, resolvePortUrl, tab.url]);

	// Sync when tab.url changes externally
	useEffect(() => {
		if (!tab.url || tab.url === currentUrl) {
			return;
		}
		setCurrentUrl(tab.url);
		setAddressBarValue(tab.url);
	}, [tab.url, currentUrl]);

	// Attach webview event listeners
	useEffect(() => {
		const webview = webviewRef.current;
		if (!webview) return;

		const handleDidStart = () => setIsLoading(true);
		const handleDidStop = () => setIsLoading(false);
		const handleDidFail = () => setIsLoading(false);

		const handleNavigate = (event: Electron.Event & { url?: string }) => {
			const url = event.url || webview.getURL();
			if (url) {
				setCurrentUrl(url);
				setAddressBarValue(url);
				void persistUrl(url);
			}
		};

		webview.addEventListener("did-start-loading", handleDidStart);
		webview.addEventListener("did-stop-loading", handleDidStop);
		webview.addEventListener("did-fail-load", handleDidFail);
		webview.addEventListener("did-navigate", handleNavigate);
		webview.addEventListener("did-navigate-in-page", handleNavigate);

		return () => {
			webview.removeEventListener("did-start-loading", handleDidStart);
			webview.removeEventListener("did-stop-loading", handleDidStop);
			webview.removeEventListener("did-fail-load", handleDidFail);
			webview.removeEventListener("did-navigate", handleNavigate);
			webview.removeEventListener("did-navigate-in-page", handleNavigate);
		};
	}, [persistUrl]);

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
					onClick={handleReload}
					disabled={!webviewRef.current}
					className="h-8 w-8"
				>
					<RotateCw
						size={16}
						className={isLoading ? "animate-spin text-blue-400" : ""}
					/>
				</Button>

				<form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
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
							<option key={`${option.service}-${option.port}`} value={option.url}>
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
						<webview
							ref={(element) => {
								webviewRef.current = element
									? (element as unknown as WebviewTag)
									: null;
							}}
							src={currentUrl}
							allowpopups
							style={{
								width: "100%",
								height: "100%",
								backgroundColor: "#fff",
							}}
						/>
					</>
				)}
			</div>
		</div>
	);
}
