export const metadata = {
	title: "Scan QR Code - Superset Mobile",
	description: "Scan a QR code to connect to your desktop",
};

export default function MobileScanLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-[100dvh] flex-col bg-black">
			<header className="flex h-14 items-center justify-center border-b border-white/10">
				<h1 className="text-lg font-semibold text-white">Superset Mobile</h1>
			</header>
			<main className="flex-1 overflow-y-auto px-4 py-6">{children}</main>
		</div>
	);
}
