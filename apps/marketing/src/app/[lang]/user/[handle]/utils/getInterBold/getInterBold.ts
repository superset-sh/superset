let interBoldPromise: Promise<ArrayBuffer> | null = null;

export function getInterBold(): Promise<ArrayBuffer> {
	if (!interBoldPromise) {
		interBoldPromise = fetch(
			new URL("../../assets/Inter-Bold.ttf", import.meta.url),
		).then((res) => res.arrayBuffer());
	}
	return interBoldPromise;
}
