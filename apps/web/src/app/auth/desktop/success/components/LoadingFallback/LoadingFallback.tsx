import Image from "next/image";

export function LoadingFallback() {
	return (
		<div className="flex flex-col items-center gap-6">
			<Image src="/title.svg" alt="Superset" width={140} height={43} priority />
			<p className="text-xl text-muted-foreground">Loading...</p>
		</div>
	);
}
