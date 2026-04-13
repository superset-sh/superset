export function sanitizeUrl(url: string): string {
	const value = url.trim();
	if (/^https?:\/\//i.test(value) || value.startsWith("about:")) {
		return value;
	}
	if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value)) {
		return `http://${value}`;
	}
	if (/^[^\s/]+\.[^\s]+(\/.*)?$/.test(value)) {
		return `https://${value}`;
	}
	return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
