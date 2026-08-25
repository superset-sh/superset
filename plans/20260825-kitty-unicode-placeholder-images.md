# Kitty Unicode placeholders (U=1): Rust TUIs render images as garbage glyphs

Superset's terminal identifies as kitty (`TERMINAL_TERM_PROGRAM = "kitty"`), but
`@xterm/addon-image` implements only *direct* kitty placements. It has no support
for **Unicode placeholders** (`U=1` + `U+10EEEE` placeholder cells). Every TUI
built on `ratatui-image` — the standard Rust terminal-image crate — uses that path
exclusively when it detects a kitty-class terminal, so those apps draw rows of
combining-diacritic garbage instead of an image.

This is a proposal, not a finished fix: the real repair is a feature in the
xterm.js addon. It documents the root cause, a byte-level repro, and three
options with a recommendation, so a maintainer can pick a direction quickly.

## Symptom

Rust TUIs that render inline images (mermaid diagrams, screenshots, generated
images) show blocks of accented punctuation where the image should be. The same
app in Ghostty, kitty, or a real kitty-class terminal renders correctly. Reported
against jcode; it affects any `ratatui-image` consumer.

## Root cause

Two independent decisions meet:

**1. We claim to be kitty.** `packages/shared/src/constants.ts:271`

```ts
export const TERMINAL_TERM_PROGRAM = "kitty";
```

Applied to every PTY in `packages/host-service/src/terminal/env.ts:238` and
`apps/desktop/src/main/lib/terminal/env.ts:477`. This is deliberate and correct —
it is what makes agent TUIs trust our full-fidelity wheel handler instead of
applying vscode-style 3x scroll amplification (PRs #5563, #5639, #5641, and the
guard test `packages/shared/src/terminal-wheel-handler/terminal-identity-coupling.test.ts`).
Nothing below suggests changing it.

**2. Our image addon does not implement the placement mode those clients then use.**
`@xterm/addon-image@0.10.0-beta.289`, `src/kitty/KittyGraphicsTypes.ts`. The
`KittyKey` enum has 21 keys — `a f i I s v x y w h X Y c r m o q C z t d p` — and
**no `U` key**. `parseKittyCommand()` silently drops `U=1`, and nothing in
`KittyGraphicsHandler.ts` consumes `U+10EEEE`. Confirmed still absent in the
latest published `0.10.0-beta.300`.

The upstream tracking issue is
[xtermjs/xterm.js#5711](https://github.com/xtermjs/xterm.js/issues/5711)
("Kitty graphics: Implement Unicode placeholder-based image display (U+10EEEE)"),
still open. Related: #6098, #6132.

### Why that breaks the client

`ratatui-image`'s kitty backend has no direct-placement fallback. It always:

1. transmits with `a=T,U=1` — creating a *virtual* placement that renders nothing
   on its own;
2. writes `U+10EEEE` cells carrying row/column diacritics, with the image id
   encoded in the foreground color, to position the image.

([source](https://docs.rs/ratatui-image/10.0.6/src/ratatui_image/protocol/kitty.rs.html))

Our handler stores the image on step 1 and then never places it, because step 2
is not a control sequence — it is ordinary text. So the placeholder cells fall
through to the normal renderer and paint as literal glyphs. Hence garbage rows
and no image: the two halves fail together, and only in a terminal that claims
kitty while lacking `U=1`.

## Repro

Self-contained, no Rust toolchain. Sends the exact byte sequence `ratatui-image`
sends. Correct result is a checkerboard; the bug shows garbage glyphs.

```bash
bash scripts/repro/kitty-unicode-placeholder.sh
```

Run it in Ghostty (image appears) and in a Superset terminal (garbage) for the
before/after pair.

## Options

**A. Implement `U=1` in the addon.** The real fix, and it fixes every affected
app at once. It is also the largest: virtual placements must be decoupled from
the cell they were transmitted at, `U+10EEEE` needs interception before normal
text rendering, and the diacritic row/column and color-encoded id must be decoded
into placements. `ImageStorage` already stores `imageId`/`tileId` per cell via
extended attributes, so the storage model can express it, but placement lifetime
is currently tied to the writing cursor. Best done upstream in
xtermjs/xterm.js#5711 rather than as a patch, since a `patchedDependencies` entry
of this size would be painful to carry (see `patches/README.md`).

**B. Advertise the truth in the kitty capability query.** Small and principled:
answer `a=q` so clients can tell that virtual placements are unavailable, letting
well-behaved ones choose another protocol. It does not help `ratatui-image`
today, which does not degrade, but it stops us from silently over-claiming.

**C. Client-side workaround (what affected apps can do now).** Detect Superset
via `SUPERSET_TERMINAL_ID` and prefer the iTerm2 inline-image (IIP) protocol,
which this addon implements fully and correctly (`src/IIPHandler.ts`). Verified
working. This is a per-app patch, not a fix, and each affected TUI has to
discover it independently — which is the reason this document exists.

## Recommendation

Pursue **A** upstream and land **B** here in the meantime, so the terminal stops
claiming a capability it does not have. Until either ships, **C** is the only
thing users can act on, so it is worth stating in the docs that Superset supports
kitty direct placements and IIP, but not kitty Unicode placeholders.

## Verified

Confirmed by reading the shipped addon source and by byte-inspecting the repro
output:

- `KittyKey` has no `U` in `0.10.0-beta.289` (the version `apps/desktop/package.json`
  pins) nor in `0.10.0-beta.300` (latest published).
- `parseKittyCommand()` drops unknown keys silently, and no code path in
  `KittyGraphicsHandler.ts` reads `U+10EEEE`, so a `U=1` transmit stores an image
  that is never placed.
- The addon's IIP path parses `width` / `height` / `preserveAspectRatio` / `inline`
  and renders correctly — which is why option C works.
- Upstream issue xtermjs/xterm.js#5711 is open and unimplemented.

Not yet captured: side-by-side Ghostty/Superset screenshots of the repro. The
script is deterministic and self-contained, so a maintainer can produce that pair
in under a minute; I did not want to attach automated screenshots I could not
verify were framing the right window.
