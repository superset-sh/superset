import { CustomDocsLayout } from "@/components/docs/custom-docs-layout";
import { source } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<CustomDocsLayout tree={source.getPageTree()}>
			{children}
		</CustomDocsLayout>
	);
}
