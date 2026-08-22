"use client";

import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { LazyMotion } from "framer-motion";
import { ThemeProvider } from "next-themes";

// Components use `m.*` (not `motion.*`) so the framer-motion feature bundle
// loads in this async chunk instead of the critical-path JS
const loadMotionFeatures = () =>
	import("./motion-features").then((mod) => mod.default);

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<LazyMotion features={loadMotionFeatures}>
			<ThemeProvider
				attribute="class"
				defaultTheme="dark"
				forcedTheme="dark"
				storageKey={THEME_STORAGE_KEY}
				disableTransitionOnChange
			>
				{children}
			</ThemeProvider>
		</LazyMotion>
	);
}
