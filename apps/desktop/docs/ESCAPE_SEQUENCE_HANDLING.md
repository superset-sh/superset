# Escape Sequence Handling

This document explains how we handle escape sequences in the terminal to prevent them from leaking into output, particularly for TUI (Terminal User Interface) applications.

## Problem

When terminal applications query terminal capabilities or send control sequences, the terminal responds with escape sequences. If these responses aren't properly suppressed, they can appear as visible text in the terminal output, breaking TUI applications like `vim`, `less`, `htop`, `ncurses`-based tools, etc.

## Solution Approach

We use **xterm.js parser hooks** to intercept and suppress escape sequences at the parser level, before they reach the display layer. This approach is similar to how iTerm2 and Hyper handle escape sequences.

### How iTerm2 Handles It

iTerm2 handles escape sequences at a very low level in their `VT100Screen` implementation. They parse sequences before they ever reach the display layer, ensuring that query responses and control sequences are handled internally and never rendered as text.

### How Hyper Handles It

Hyper uses xterm.js (like we do) but **does not use parser hooks** to suppress escape sequences. They rely entirely on xterm.js's default behavior. This means Hyper trusts that xterm.js handles query responses correctly internally.

However, we've found that some query responses can still leak into the terminal output, which is why we implement explicit suppression using parser hooks.

### Our Implementation

We use the same parser hook approach as Hyper. The `suppressQueryResponses` function registers handlers for various escape sequence types:

- **CSI sequences**: Device Attributes (DA), Cursor Position Reports (CPR), Mode Reports, Device Status Reports (DSR), Terminal ID queries
- **OSC sequences**: Color query responses (OSC 10-19)
- **ESC sequences**: Various control sequences

## Supported Sequences

### CSI Sequences

- `ESC[...c` - Device Attributes (DA1, DA2)
- `ESC[...R` - Cursor Position Report (CPR)
- `ESC[...$y` - Mode Reports (DECRPM)
- `ESC[...n` - Device Status Reports (DSR)
- `ESC[?...n` - DEC Private Mode Status Reports
- `ESC[...q` - Terminal ID queries
- `ESC[>...q` - Terminal ID responses
- `ESC[...x` - Request Terminal Parameters
- `ESC[?...x` - DEC Request Terminal Parameters

### OSC Sequences

- `ESC]10;...BEL` - Foreground color query response
- `ESC]11;...BEL` - Background color query response
- `ESC]12;...BEL` - Cursor color query response
- `ESC]13-19;...BEL` - Additional color query responses

## Implementation Details

The suppression is implemented in:
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/suppressQueryResponses.ts`

This function is called during terminal initialization in:
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/helpers.ts`

## How Parser Hooks Work

1. When `term.write(data)` is called, data enters the parser
2. The parser identifies escape sequences (CSI, OSC, ESC, etc.)
3. For each sequence type, registered handlers are called in reverse registration order
4. If a handler returns `true`, the sequence is suppressed and no further handlers are called
5. If a handler returns `false`, the next handler is tried
6. If no handler returns `true`, the default xterm.js handler processes the sequence

## Testing

To test escape sequence suppression:

1. Run a TUI application like `vim`, `less`, or `htop`
2. Verify that escape sequences don't appear as visible text
3. Check that cursor positioning and screen updates work correctly
4. Test with programs that query terminal capabilities (e.g., `tput` commands)

## Common Issues

### Escape sequences still appearing

If escape sequences are still leaking into output:

1. Check if the sequence type is registered in `suppressQueryResponses`
2. Verify the sequence format matches the handler pattern
3. Check xterm.js documentation for sequence format details
4. Add a new handler for the problematic sequence type

### TUI applications not working correctly

If TUI applications aren't working:

1. Verify that we're not suppressing sequences that should be processed
2. Check that handlers return `true` only for query responses, not control sequences
3. Ensure we're not interfering with legitimate terminal state changes

## References

- [xterm.js Parser Hooks Documentation](http://xtermjs.org/docs/guides/hooks/)
- [xterm.js Parser API](http://xtermjs.org/docs/api/terminal/interfaces/iparser/)
- [iTerm2 Source Code](https://github.com/gnachman/iTerm2)
- [Hyper Source Code](https://github.com/vercel/hyper)
- [ECMA-48 Standard](https://www.ecma-international.org/publications/files/ECMA-ST/Ecma-048.pdf)
- [VT100.net Documentation](https://vt100.net/)
