export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
				{children}
			</body>
		</html>
	);
}
