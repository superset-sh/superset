import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { DatabaseTable } from "@/components/DatabaseTable";
import { DownloadButton } from "@/components/DownloadButton";
import { ResourceCard } from "@/components/ResourceCard";
import { ResourceGrid } from "@/components/ResourceGrid";
import { YouTubeVideo } from "@/components/YouTubeVideo";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
	return {
		...defaultMdxComponents,
		DownloadButton,
		DatabaseTable,
		ResourceCard,
		ResourceGrid,
		YouTubeVideo,
		Tab,
		Tabs,
		...components,
	};
}
