---
description: Apply clean code philosophy - eliminate unnecessary comments, simplify code
allowed-tools: Read, Edit, Write, Glob, Grep
---

Apply clean code philosophy to the code, with special emphasis on comments:

## Comment Guidelines

**Remove comments that:**
- Restate what the code obviously does (e.g., `// increment counter` before `counter++`)
- Describe "what" instead of "why" - the code itself should show what it does
- Are outdated or no longer match the code
- Exist because the code is unclear (fix the code instead)
- Are commented-out code blocks (delete them - version control exists)
- Are TODO/FIXME that will never be addressed

**Keep or add comments only when:**
- Explaining *why* a non-obvious decision was made
- Documenting external constraints or business rules not evident from code
- Warning about non-intuitive behavior or edge cases
- Required for public API documentation (JSDoc, docstrings)

## Code Simplification

- Rename variables/functions to be self-documenting instead of adding comments
- Extract well-named functions instead of commenting code blocks
- Use early returns to reduce nesting
- Remove dead code, unused variables, and redundant logic
- Simplify overly clever or complex expressions
- Prefer explicit over implicit

## Philosophy

"Code is read far more often than it is written. Write code that explains itself."

If a comment is needed to understand code, first try to rewrite the code to be clearer.
The best comment is the one you didn't need to write.

$ARGUMENTS
