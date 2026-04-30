import {
	BookOpen,
	CircleHelp,
	Gauge,
	type LucideIcon,
	Rocket,
	Terminal,
} from "lucide-react";
import { source } from "@/lib/source";

interface SidebarItem {
	title: string;
	href: string;
}

interface SidebarSection {
	title: string;
	Icon: LucideIcon;
	items: SidebarItem[];
}

export interface Product {
	id: string;
	title: string;
	description: string;
	url: string;
	Icon: LucideIcon;
	rootPath?: string;
	sections: SidebarSection[];
}

const iconMap: Record<string, LucideIcon> = {
	Rocket,
	Gauge,
	BookOpen,
	CircleHelp,
	Terminal,
};

const PRODUCTS_META: Array<Omit<Product, "sections" | "url">> = [
	{
		id: "docs",
		title: "Documentation",
		description: "The Superset desktop app",
		Icon: BookOpen,
		rootPath: undefined,
	},
	{
		id: "cli",
		title: "CLI",
		description: "Command line interface",
		Icon: Terminal,
		rootPath: "cli",
	},
];

interface PageTreeNode {
	type: string;
	name?: unknown;
	url?: string;
	root?: boolean;
	children?: PageTreeNode[];
}

function parseSectionsFromSeparators(nodes: PageTreeNode[]): SidebarSection[] {
	const sections: SidebarSection[] = [];
	let currentSection: SidebarSection | null = null;

	for (const node of nodes) {
		if (node.type === "separator") {
			const name = String(node.name ?? "");
			const match = name.match(/^(\w+)\s+(.+)$/);
			if (match) {
				const [, iconName, title] = match;
				currentSection = {
					title,
					Icon: iconMap[iconName] || Rocket,
					items: [],
				};
				sections.push(currentSection);
			}
		} else if (node.type === "page" && currentSection && node.url) {
			currentSection.items.push({
				title: String(node.name ?? ""),
				href: node.url,
			});
		}
	}

	return sections;
}

function collectPages(nodes: PageTreeNode[]): SidebarItem[] {
	const items: SidebarItem[] = [];
	for (const node of nodes) {
		if (node.type === "page" && node.url) {
			items.push({ title: String(node.name ?? ""), href: node.url });
		} else if (node.type === "folder" && node.children) {
			items.push(...collectPages(node.children));
		}
	}
	return items;
}

function getFolderRootSegment(folder: PageTreeNode): string | undefined {
	for (const child of folder.children ?? []) {
		if (child.type === "page" && child.url) {
			const segments = child.url.split("/").filter(Boolean);
			if (segments.length > 0) return segments[0];
		}
		if (child.type === "folder") {
			const nested = getFolderRootSegment(child);
			if (nested) return nested;
		}
	}
	return undefined;
}

function buildProducts(): Product[] {
	const tree = source.pageTree as {
		children: PageTreeNode[];
		fallback?: { children: PageTreeNode[] };
	};
	const rootFolders: PageTreeNode[] = [
		...tree.children.filter(
			(node) => node.type === "folder" && node.root === true,
		),
		...(tree.fallback?.children.filter(
			(node) => node.type === "folder" && node.root === true,
		) ?? []),
	];
	const products: Product[] = [];

	for (const meta of PRODUCTS_META) {
		if (meta.rootPath === undefined) {
			const sections = parseSectionsFromSeparators(tree.children);
			const firstItem = sections[0]?.items[0];
			products.push({
				...meta,
				url: firstItem?.href ?? "/",
				sections,
			});
			continue;
		}

		const folder = rootFolders.find(
			(node) => getFolderRootSegment(node) === meta.rootPath,
		);

		if (!folder?.children) continue;

		const separatorSections = parseSectionsFromSeparators(folder.children);
		const sections =
			separatorSections.length > 0
				? separatorSections
				: [
						{
							title: meta.title,
							Icon: meta.Icon,
							items: collectPages(folder.children),
						},
					];

		const firstItem = sections[0]?.items[0];
		products.push({
			...meta,
			url: firstItem?.href ?? `/${meta.rootPath}`,
			sections,
		});
	}

	return products;
}

export const products: Product[] = buildProducts();

export function getActiveProductId(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	const first = segments[0];
	for (const product of products) {
		if (product.rootPath && first === product.rootPath) {
			return product.id;
		}
	}
	return "docs";
}

export const sections: SidebarSection[] = products[0]?.sections ?? [];
