# @superset/email Frontend Package Guidelines

## Scope
React Email templates, shared email components, Tailwind email config, and email maintenance scripts.

## Source Examples
- `packages/email/src/emails/contact-inquiry.tsx` and `enterprise-inquiry.tsx` are form-driven templates.
- `packages/email/src/emails/member-added.tsx` and billing variants show account lifecycle emails.
- `packages/email/src/components/index.ts` exports shared email components.
- `packages/email/scripts/notify-disconnected-integrations.ts` is a script-side email workflow.

## Local Patterns
- Export templates from `./emails/*` and keep each template in `src/emails/<name>.tsx`.
- Use React Email components and the package Tailwind config; email CSS must remain email-client friendly.
- Use typed props and keep provider/env logic outside template components.
- Preview with the package `dev` script and export with `email export` when needed.

## Avoid
- Do not call Resend directly from templates.
- Do not rely on app-only CSS in email markup.
- Do not hard-code production URLs when an env/config value exists.

## Validation
- `bun --cwd packages/email typecheck`
- `bun --cwd packages/email export` when template rendering changes significantly.
