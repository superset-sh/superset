export function splitPath(path: string): { dir: string; name: string } {
	const slashIndex = path.lastIndexOf("/");
	if (slashIndex === -1) return { dir: "", name: path };
	return {
		dir: path.slice(0, slashIndex + 1),
		name: path.slice(slashIndex + 1),
	};
}
