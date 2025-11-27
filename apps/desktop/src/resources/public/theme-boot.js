// Apply saved theme class immediately to prevent flash of wrong colors
// This runs before React hydration to ensure correct initial appearance
(() => {
	try {
		var themeType = localStorage.getItem("theme-type");
		document.documentElement.classList.add(
			themeType === "light" ? "light" : "dark",
		);
	} catch (e) {
		document.documentElement.classList.add("dark");
	}
})();
