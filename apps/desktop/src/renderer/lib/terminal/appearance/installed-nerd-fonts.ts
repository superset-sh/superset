/**
 * Detect Nerd Font families installed on this machine so the terminal font
 * stack can fall back to them for private-use-area icon glyphs (SUPER-1782).
 * The static NERD_FONT_FALLBACK_FAMILIES list only covers well-known names;
 * users install arbitrarily named patches ("0xProto Nerd Font",
 * "MesloLGLDZ Nerd Font Mono", …) that would otherwise never enter the stack.
 */

/** Nerd Fonts patcher family names: "X Nerd Font [Mono]" or short "X NF/NFM". */
const NERD_FONT_NAME_PATTERN = /nerd font/i;
const NERD_FONT_ABBREV_PATTERN = / NFM?$/i;
/** Proportional variants — their icons break monospace cell metrics. */
const PROPORTIONAL_VARIANT_PATTERN = /(?: propo| NFP)$/i;
/** Mono 변형 이름: "X Nerd Font Mono" 또는 축약형 "X NFM". */
const MONO_VARIANT_PATTERN = /(?:nerd font mono| NFM)$/i;

export function isNerdFontFamily(family: string): boolean {
	if (PROPORTIONAL_VARIANT_PATTERN.test(family)) return false;
	return (
		NERD_FONT_NAME_PATTERN.test(family) || NERD_FONT_ABBREV_PATTERN.test(family)
	);
}

/**
 * Nerd Font 의 Mono 변형인지 판정한다.
 *
 * Mono 변형은 모든 글리프에 단일 advance width 를 강제하므로, 아이콘이 셀
 * 하나에 정확히 들어맞는다(WebGL 셀 렌더러에 유리 — 그래서 폰트 스택에서
 * Mono 를 앞세운다). 반대로 DOM 텍스트 레이아웃에서는 전각 CJK 글리프까지
 * 반각 폭으로 계산돼 버린다(14px 기준 "글" 실측: Mono 7px vs 비-Mono 14px).
 * IME 조합 오버레이처럼 DOM 폭에 의존하는 곳에서는 이 변형을 걸러내야 한다.
 */
export function isNerdFontMonoVariant(family: string): boolean {
	return MONO_VARIANT_PATTERN.test(family);
}

/**
 * Keep the CSS stack bounded when a user has many Nerd Fonts installed.
 *
 * 주의: 이 상한은 Mono-first 정렬 **뒤에** 적용된다. Mono 변형이 8개 이상
 * 깔린 머신에서는 비-Mono 형제가 전부 잘려 IME 오버레이 스택(Mono 제외)에
 * 설치 폰트가 하나도 안 남는다. 이 머신은 대상 family 가 4개라 당장은
 * 문제되지 않아 현 상태로 둔다.
 */
const MAX_DETECTED_FAMILIES = 8;

let cached: Promise<string[]> | null = null;

/**
 * Enumerate installed Nerd Font families via the Local Font Access API.
 * Resolves to [] when the API is unavailable or enumeration fails; the
 * result is cached for the renderer's lifetime (font installs mid-session
 * aren't visible to Chromium without a relaunch anyway).
 */
export function detectInstalledNerdFontFamilies(): Promise<string[]> {
	cached ??= (async () => {
		try {
			const query = window.queryLocalFonts;
			if (typeof query !== "function") return [];
			const fonts = await query.call(window);

			const seen = new Set<string>();
			const families: string[] = [];
			for (const font of fonts) {
				const family = font.family;
				if (!family) continue;
				const key = family.toLowerCase();
				if (seen.has(key)) continue;
				seen.add(key);
				if (isNerdFontFamily(family)) families.push(family);
			}
			// Mono variants first — their icons are drawn to fit a single cell.
			families.sort(
				(a, b) =>
					Number(isNerdFontMonoVariant(b)) - Number(isNerdFontMonoVariant(a)),
			);
			return families.slice(0, MAX_DETECTED_FAMILIES);
		} catch {
			return [];
		}
	})();
	return cached;
}
