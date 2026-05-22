# Deferred follow-ups for SUPER-869

These are larger improvements noticed during investigation but explicitly excluded from all three scope options:

1. **Default preset for new users** — Adding `includeInDefaultTerminalPresets: true` / adding to `DEFAULT_PRESET_IDS` would seed Droid to all new users. Requires product sign-off on whether a commercial third-party tool should be a default. Tracked in strategic option.

2. **Droid Exec headless mode support** — Droid supports `droid exec` for non-interactive/headless automation. A future preset variant could offer a headless mode for CI/CD or automated task execution, similar to how some agents have different transport modes. Out of scope — the interactive `droid` command is the right default for the terminal preset picker.

3. **Auto-detect installed droid binary** — The preset picker could detect whether `droid` is installed on the user's system and gray out / hide uninstalled presets. This is a cross-cutting improvement affecting all presets, not just droid.
