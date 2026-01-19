import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { Inter } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { NavbarProvider } from "@/components/nav-mobile";

const inter = Inter({
	subsets: ["latin"],
});

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html lang="en" className={inter.className} suppressHydrationWarning>
			<body className="flex flex-col min-h-screen">
				<RootProvider>
					<NavbarProvider>
						<Navbar />
						{children}
					</NavbarProvider>
				</RootProvider>
			</body>
		</html>
	);
}
