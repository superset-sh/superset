import { useEffect } from "react";

/**
 * Hook to handle deep link URLs
 *
 * @param handler - Callback function to handle the deep link URL
 * @param pollInterval - Interval in milliseconds to poll for deep link URLs (default: 1000ms)
 *
 * @example
 * ```tsx
 * useDeepLink((url) => {
 *   console.log('Deep link received:', url);
 *   // Parse and handle the URL
 *   const urlObj = new URL(url);
 *   if (urlObj.hostname === 'workspace') {
 *     // Handle workspace deep link
 *     const workspaceId = urlObj.pathname.slice(1);
 *     // Load workspace...
 *   }
 * });
 * ```
 */
export function useDeepLink(
	handler: (url: string) => void,
	pollInterval = 1000,
): void {
	useEffect(() => {
		let mounted = true;
		let timeoutId: NodeJS.Timeout;

		const checkForDeepLink = async () => {
			if (!mounted) return;

			try {
				const url = await window.ipcRenderer.invoke("deep-link-get-url");
				if (url && mounted) {
					console.log("[useDeepLink] Deep link received:", url);
					handler(url);
				}
			} catch (error) {
				console.error("[useDeepLink] Error checking for deep link:", error);
			}

			// Schedule next check
			if (mounted) {
				timeoutId = setTimeout(checkForDeepLink, pollInterval);
			}
		};

		// Start polling
		checkForDeepLink();

		// Cleanup
		return () => {
			mounted = false;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [handler, pollInterval]);
}
