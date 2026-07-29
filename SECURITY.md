# Security Policy

We take the security of Superset seriously. Thank you for helping keep our users safe by reporting vulnerabilities responsibly.

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues, Discord, or social media.

Report privately through one of these channels:

1. **GitHub private vulnerability reporting (preferred):** use the ["Report a vulnerability"](https://github.com/superset-sh/superset/security/advisories/new) button under the Security tab of this repository.
2. **Email:** send details to [support@superset.sh](mailto:support@superset.sh) with "Security" in the subject line.

Please include as much of the following as you can:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- Affected component (desktop app, CLI, host service, API, web app, marketing site) and version
- Any suggested remediation

## What to expect

- We will acknowledge your report within 3 business days.
- We will keep you informed as we investigate and work on a fix.
- We will credit you in the fix's release notes if you would like (tell us how you want to be credited).

We ask that you give us a reasonable window to remediate before disclosing publicly, and that you avoid accessing other users' data, degrading the service, or pivoting beyond what is needed to demonstrate the issue.

## Scope

In scope:

- The Superset desktop app, CLI, and host service (this repository)
- The Superset API and web app (superset.sh, app.superset.sh, relay.superset.sh)

Out of scope:

- Denial of service and volumetric attacks
- Social engineering of Superset employees or users
- Findings that require a compromised device or physical access
- Third-party services we integrate with (report those to the vendor)

## Supported versions

Only the latest released version of the desktop app and CLI receives security fixes. Please verify findings against the current release when possible.
