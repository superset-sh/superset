# @superset/port-scanner Backend Package Guidelines

## Scope
Port scanning, process discovery, static port definitions, and process tree helpers.

## Source Examples
- `packages/port-scanner/src/scanner.ts` scans ports.
- `packages/port-scanner/src/procfs.ts` implements Linux procfs helpers.
- `packages/port-scanner/src/port-manager.ts` coordinates port allocations.
- `packages/port-scanner/src/*.test.ts` covers scanner, procfs, and manager behavior.

## Local Patterns
- Keep OS-specific code isolated, as procfs-specific logic is in `procfs.ts`.
- Use typed result objects from `types.ts` and central static constants from `static-ports.ts`.
- Add tests for platform edge cases and process tree behavior.

## Avoid
- Do not shell out from call sites when this package already exposes a scanner/helper.
- Do not assume Linux procfs is present on macOS.

## Validation
- `bun --cwd packages/port-scanner test`
- `bun --cwd packages/port-scanner typecheck`
