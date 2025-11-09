/**
 * Deep Link Manager
 *
 * Manages deep link URLs for the application.
 * Handles both app launch and runtime deep links.
 */
class DeepLinkManager {
	private currentUrl: string | null = null;

	/**
	 * Set the deep link URL
	 */
	setUrl(url: string): void {
		console.log("[DeepLinkManager] Setting deep link URL:", url);
		this.currentUrl = url;
	}

	/**
	 * Get and clear the deep link URL
	 * @returns The current deep link URL, or null if none
	 */
	getAndClearUrl(): string | null {
		const url = this.currentUrl;
		this.currentUrl = null;
		return url;
	}

	/**
	 * Get the deep link URL without clearing it
	 * @returns The current deep link URL, or null if none
	 */
	getUrl(): string | null {
		return this.currentUrl;
	}

	/**
	 * Clear the deep link URL
	 */
	clearUrl(): void {
		this.currentUrl = null;
	}
}

// Export singleton instance
export const deepLinkManager = new DeepLinkManager();
