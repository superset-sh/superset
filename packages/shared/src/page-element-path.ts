export const PAGE_ELEMENT_PATH_RUNTIME_SOURCE = `(() => {
	const cache = new Map();

	const pathOf = (el) => {
		const parts = [];
		let node = el;
		while (node && node.nodeType === 1 && node !== document.body) {
			const parent = node.parentElement;
			if (!parent) return "";
			let index = 1;
			for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
				if (s.tagName === node.tagName) index += 1;
			}
			parts.unshift(node.tagName.toLowerCase() + ":nth-of-type(" + index + ")");
			node = parent;
		}
		return parts.join(" > ");
	};

	const resolve = (path) => {
		if (!path) return null;
		const cached = cache.get(path);
		if (cached && cached.isConnected) return cached;
		try {
			const el = document.body.querySelector(":scope > " + path);
			if (el) cache.set(path, el);
			else cache.delete(path);
			return el;
		} catch {
			return null;
		}
	};

	return { pathOf, resolve, forget: () => cache.clear() };
})()`;
