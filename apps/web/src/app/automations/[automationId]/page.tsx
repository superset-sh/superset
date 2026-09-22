import { DeepLinkRedirect } from "@/components/DeepLinkRedirect";

interface PageProps {
	params: Promise<{ automationId: string }>;
}

export default async function AutomationDeepLinkPage({ params }: PageProps) {
	const { automationId } = await params;
	return (
		<DeepLinkRedirect
			path={`automations/${encodeURIComponent(automationId)}`}
		/>
	);
}
