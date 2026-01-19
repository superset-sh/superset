import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { DownloadButton } from "@/components/docs/DownloadButton";
import {
	DatabaseTable,
	ResourceCard,
	ResourceGrid,
} from "@/components/ui";

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
