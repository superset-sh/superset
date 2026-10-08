import { useCallback, useState } from "react";

const STORAGE_KEY = "chatFavoriteModels";
const MAX_FAVORITES = 24;

export type FavoriteModel = { presetId: string; id: string; label: string };

function isFavoriteModel(value: unknown): value is FavoriteModel {
	if (typeof value !== "object" || value === null) return false;
	const { presetId, id, label } = value as Record<string, unknown>;
	return (
		typeof presetId === "string" &&
		typeof id === "string" &&
		typeof label === "string"
	);
}

function readFavorites(): FavoriteModel[] {
	try {
		const parsed: unknown = JSON.parse(
			window.localStorage.getItem(STORAGE_KEY) ?? "[]",
		);
		return Array.isArray(parsed)
			? parsed.filter(isFavoriteModel).slice(-MAX_FAVORITES)
			: [];
	} catch {
		return [];
	}
}

const same = (a: FavoriteModel, b: FavoriteModel) =>
	a.presetId === b.presetId && a.id === b.id;

export function toggleFavorite(
	favorites: FavoriteModel[],
	model: FavoriteModel,
): FavoriteModel[] {
	return favorites.some((favorite) => same(favorite, model))
		? favorites.filter((favorite) => !same(favorite, model))
		: [...favorites, model].slice(-MAX_FAVORITES);
}

export function useFavoriteModels() {
	const [favorites, setFavorites] = useState(readFavorites);
	const toggle = useCallback((model: FavoriteModel) => {
		setFavorites((previous) => {
			const next = toggleFavorite(previous, model);
			try {
				if (next.length === 0) window.localStorage.removeItem(STORAGE_KEY);
				else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			} catch {}
			return next;
		});
	}, []);
	return { favorites, toggle };
}
