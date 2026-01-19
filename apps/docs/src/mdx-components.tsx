import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { DownloadButton } from "@/components/DownloadButton";
import { DatabaseTable } from "@/components/DatabaseTable";
import { ResourceCard } from "@/components/ResourceCard";
import { ResourceGrid } from "@/components/ResourceGrid";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
	return {
		...defaultMdxComponents,
		DownloadButton,
		DatabaseTable,
		ResourceCard,
		ResourceGrid,
		...components,
	};
}
