import { COMPANY } from "@superset/shared/constants";
import { generate as DefaultImage } from "fumadocs-ui/og";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getPageImage, source } from "@/lib/source";

export const revalidate = false;

export async function GET(
	_req: Request,
	{ params }: RouteContext<"/og/docs/[...slug]">,
) {
	const { slug } = await params;
	const page = source.getPage(slug.slice(0, -1));
	if (!page) notFound();

	return new ImageResponse(
		<DefaultImage
			title={page.data.title}
			description={page.data.description}
			site={COMPANY.NAME}
			icon={
				// biome-ignore lint/performance/noImgElement: Satori requires plain HTML elements
				<img
					src={`${COMPANY.DOCS_URL}/logo.png`}
					alt=""
					width={40}
					height={40}
				/>
			}
			primaryColor="rgba(255,255,255,0.15)"
			primaryTextColor="rgb(255,255,255)"
		/>,
		{
			width: 1200,
			height: 630,
		},
	);
}

export function generateStaticParams() {
	return source.getPages().map((page) => ({
		lang: page.locale,
		slug: getPageImage(page).segments,
	}));
}
