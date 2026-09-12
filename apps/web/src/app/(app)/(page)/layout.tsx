import { PageContainer } from "../components/PageContainer";

export default function PageLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <PageContainer>{children}</PageContainer>;
}
