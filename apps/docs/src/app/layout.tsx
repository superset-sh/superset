import { Banner } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import type * as React from "react";
import "nextra-theme-docs/style.css";

import { Providers } from "./providers";

export const metadata = {
	title: "Superset Docs",
	description: "Superset Documentation",
};

const banner = (
	<Banner storageKey="superset-docs-banner">
		Welcome to Superset Documentation
	</Banner>
);

const navbar = <Navbar logo={<strong>Superset</strong>} />;

const footer = (
	<Footer>
		<p>© {new Date().getFullYear()} Superset. All rights reserved.</p>
	</Footer>
);

export default async function DocsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>
				<Providers>
					<Layout
						banner={banner}
						navbar={navbar}
						pageMap={await getPageMap()}
						docsRepositoryBase="https://github.com/yourusername/superset"
						footer={footer}
					>
						{children}
					</Layout>
				</Providers>
			</body>
		</html>
	);
}
