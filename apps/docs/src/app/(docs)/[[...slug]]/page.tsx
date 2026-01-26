import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageImage, source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";
import { DocsBody, DocsPage, DocsTitle } from "./components/DocsPageLayout";
import { LLMCopyButton, ViewOptions } from "./components/PageActions";

export default async function Page(props: PageProps<"/[[...slug]]">) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const MDX = page.data.body;

	return (
		<DocsPage
			toc={page.data.toc}
			full={page.data.full}
			tableOfContent={{
				header: <div className="w-10 h-4"></div>,
			}}
			editOnGithub={{
				owner: "superset-sh",
				repo: "superset",
				path: `apps/docs/content/docs/${page.path}`,
			}}
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			<div className="flex flex-row gap-2 items-center border-b pb-3">
				<LLMCopyButton markdownUrl={`${page.url}.mdx`} />
				<ViewOptions
					markdownUrl={`${page.url}.mdx`}
					githubUrl={`https://github.com/superset-sh/superset/blob/main/apps/docs/content/docs/${page.path}`}
				/>
			</div>
			<DocsBody>
				<MDX components={getMDXComponents()} />
			</DocsBody>
		</DocsPage>
	);
}

export async function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(
	props: PageProps<"/[[...slug]]">,
): Promise<Metadata> {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const pageImage = getPageImage(page).url;

	return {
		title: page.data.title,
		description: page.data.description,
		alternates: {
			canonical: page.url,
		},
		openGraph: {
			title: page.data.title,
			description: page.data.description,
			images: [pageImage],
		},
		twitter: {
			card: "summary_large_image",
			title: page.data.title,
			description: page.data.description,
			images: [pageImage],
		},
	};
}
