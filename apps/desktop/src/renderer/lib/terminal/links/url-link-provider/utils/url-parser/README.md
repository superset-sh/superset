# Terminal URL parsing

`url-parser.ts` adapts VS Code's `src/vs/editor/common/languages/linkComputer.ts`
from commit `fc67f14caacdc4db3f77fee74498395a2fb824b1`. The MIT notices are in
`LICENSE`. The state machine and quote/bracket/Markdown/Unicode delimiter rules
are retained; editor types and imports are removed, the character classifier
uses a Map, only referenced character codes are included, and the static class
is expressed as functions. Square-bracket context is reset between links so an
unterminated bracket cannot make a later URL absorb trailing prose.

The provider applies terminal-specific policy after parsing: HTTP(S) only,
URL-constructor validation, 4096 UTF-16 code units maximum, balanced delimiter
trimming, and the existing trailing `!?` trimming. File links are handled by the
separate local-link provider; editor-only file URI resolution is not imported.

The buffer adapter follows xterm's soft-wrap and cell-width model, mapping each
UTF-16 code unit to its actual start/end terminal cells. It preserves whitespace
at wraps and skips only the empty final cell caused by an early-wrapped wide
character. Context is bounded on either side of the hovered row, budgeting two
cells per URL code unit. Explicit newlines are never inferred to be URL wraps.

## Fixtures

`../../url-link-fixtures.json` contains every active HTTP(S) input/expected-URL
pair from VS Code's editor `linkComputer.test.ts`, plus the additional unique
HTTP(S) cases from its terminal `terminalUriLinkDetector.test.ts`. File URI and
null editor-model tests are outside the web-link provider's contract.

xterm.js commit `c8c8b3a7fe7e94113a49d44ed10cd0dc34f6d50a` supplies all 247
country TLDs, `.com`, `.com` + country variants, and the seven hostname patterns,
plus all uppercase/default-port and eight distinct coordinate expectations in
`addons/addon-web-links/test/WebLinksAddon.test.ts`. Wave and Tabby use that addon;
they do not supply another URL parser to copy.

Alacritty commit `2f03c30283a111bdbfb6ccd7bcb03a6290ba1151` supplies the
bracket-balancing and trailing-punctuation behavior in
`alacritty/src/display/hint.rs`. Tests cover that behavior and its standalone
closing-bracket non-loop regression. Its keyboard hint labels, viewport search,
and OSC 8 deduplication are outside this provider; Superset's existing manager
retains xterm's OSC 8 provider and has separate lifecycle tests.

All cases run against real `@xterm/headless` buffers. Additional regressions cover
log prefixes, hard vs soft newlines, boundaries, ANSI styles, callbacks, multiple
rows, malformed URLs, maximum length, pathological input, and resize/reflow of
completed output lines. Reflow of the live cursor line is controlled by xterm.
