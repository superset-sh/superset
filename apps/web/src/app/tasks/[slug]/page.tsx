import { DeepLinkRedirect } from "@/components/DeepLinkRedirect";

interface PageProps {
	params: Promise<{ slug: string }>;
}

export default async function TaskDeepLinkPage({ params }: PageProps) {
	const { slug } = await params;
	return <DeepLinkRedirect path={`tasks/${encodeURIComponent(slug)}`} />;
}
