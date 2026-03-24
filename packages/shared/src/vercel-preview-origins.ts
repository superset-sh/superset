const vercelDeploymentApps = [
	"api",
	"web",
	"admin",
	"marketing",
	"docs",
] as const;
const trustedPreviewBrowserApps = ["web", "admin", "marketing"] as const;

function getDeploymentOrigin(deploymentUrl: string | URL | null | undefined) {
	if (!deploymentUrl) {
		return null;
	}

	try {
		return new URL(deploymentUrl).origin;
	} catch {
		return null;
	}
}

function getVercelPreviewSuffix(origin: string) {
	const { hostname } = new URL(origin);

	if (!hostname.endsWith(".vercel.app")) {
		return null;
	}

	for (const app of vercelDeploymentApps) {
		const prefix = `${app}-`;
		if (hostname.startsWith(prefix)) {
			return hostname.slice(prefix.length);
		}
	}

	return null;
}

export function getTrustedVercelPreviewOrigins(
	deploymentUrl: string | URL | null | undefined,
) {
	const origin = getDeploymentOrigin(deploymentUrl);
	if (!origin) {
		return [];
	}

	const previewSuffix = getVercelPreviewSuffix(origin);
	if (!previewSuffix) {
		return [];
	}

	return trustedPreviewBrowserApps.map(
		(app) => `https://${app}-${previewSuffix}`,
	);
}
