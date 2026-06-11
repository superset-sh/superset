import type { StateStorage } from "zustand/middleware";

export const browserLocalStorage: StateStorage = {
	getItem: (name) => {
		if (typeof window === "undefined") return null;
		return window.localStorage.getItem(name);
	},
	removeItem: (name) => {
		if (typeof window === "undefined") return;
		window.localStorage.removeItem(name);
	},
	setItem: (name, value) => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(name, value);
	},
};
