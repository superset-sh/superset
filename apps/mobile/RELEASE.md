# Mobile App Release Process

iOS only. Builds and submissions go through EAS; the App Store listing and the
App Review notes live in [`store.config.js`](./store.config.js) and are pushed
with `eas metadata:push`. This file is the runbook for shipping a build and for
getting unstuck when App Review rejects or stalls it.

## Versioning

- `version` in `app.config.ts` and `store.config.js` is the marketing version.
  Keep it on the `1.x` line; bump the **patch** number for routine releases and
  the minor for visible feature drops. Large version jumps (1.x to 2.0) and long
  gaps between submissions both draw extra scrutiny from App Review.
- Build numbers auto-increment on EAS (`appVersionSource: "remote"` plus
  `autoIncrement: true` in the `production` profile). Never set them by hand.
- Submit often. A small diff against the last approved build is the cheapest
  review there is; dry-run a submission before a launch so anything new that
  trips a guideline surfaces before the date matters.

## Shipping a build

Authenticate once per machine: `eas login` (or `EXPO_TOKEN` in CI, with
`--non-interactive`). Submissions use the App Store Connect API key stored in
EAS credentials, so no Apple password is needed locally. Keep the demo-account
credentials in your secret store (1Password) and export them into the shell
for the metadata push rather than typing them into the command.

```bash
cd apps/mobile

# 1. Build. Production profile auto-increments the build number.
eas build --platform ios --profile production

# 2. Upload the build to App Store Connect (TestFlight). This does not submit
#    it for App Review.
eas submit --platform ios --profile production --latest

# 3. Listing + App Review notes, once App Store Connect has processed the
#    build. APP_REVIEW_VIDEO_URL is optional but worth it: a two-minute screen
#    recording of sign-in and the main flows is the single most effective
#    thing in the notes.
eas metadata:push   # with APP_REVIEW_EMAIL / APP_REVIEW_PASSWORD / APP_REVIEW_VIDEO_URL exported

# 4. In App Store Connect, attach the processed build to the version and
#    press "Submit for Review".
```

Before pressing submit, run the pre-flight below. Most first-submission
rejections in this category are one of these.

### Pre-flight

- [ ] Demo account signs in with email, has **no two-factor prompt**, and lands
      in an organization on Pro with a workspace that already has agent
      sessions. Reviewers will not install the desktop app.
- [ ] Review notes in `store.config.js` still describe the current screens
      (the headings in that file map to the guidelines reviewers check:
      payments, Sign in with Apple, account deletion, on-device code execution,
      permissions).
- [ ] No in-app button, link, or copy points at a web page where a plan can be
      bought (guideline 3.1.1 outside the US storefront; we ship one build
      worldwide). Mentioning that plans are managed on the web is fine;
      linking to it is not.
- [ ] Sign in with Apple is present on the sign-in screen whenever any other
      third-party sign-in is (4.8).
- [ ] Account deletion works from Settings without leaving the app (5.1.1 v).
- [ ] Every permission string in `app.config.ts` says what the feature does
      with the data, and the app works when the permission is denied.
- [ ] Nothing new downloads or executes user or project code on the device
      (2.5.2). The app renders streamed data and sends input to a remote
      session; keep it that way in both behavior and wording.
- [ ] Screenshots and description match the build (no features that are behind
      a flag or not in this build).

## When the build is rejected

Work the list top to bottom; each step costs minutes and they compound.

1. **Resubmit, don't argue in the thread.** Fix what is fixable, then reply to
   the rejection *and* upload a new build under the same version. Put a screen
   recording in the reply that walks the reviewer to the exact screen and shows
   the change. A reply without a recording is routinely ignored; a fresh build
   gets a fresh reviewer.
2. **If the rejection is wrong** (the reviewer could not find a permission that
   is plainly there, asked for Sign in with Apple that already exists, etc.)
   do the same thing: reply with a recording of the feature working, cite the
   guideline section, and resubmit. For a metadata-only rejection, fix the
   metadata and resubmit the same build; upload a new build only when the
   binary changes. Do not remove working features to satisfy a misread.
3. **Ask for a call.** In the rejection thread (Resolution Center) request a
   phone call with App Review. They prefer approving the build over scheduling
   the call, and you end up with a named contact either way.
4. **Call Apple Developer Support** and ask for App Review escalation. Say the
   release is blocked and the fix is business-critical. Escalate until someone
   says they will contact the review team, then call again if nothing has
   moved in a few hours. There is no limit on calls per day.
5. **Appeal to the App Review Board** if the rejection stands on a guideline
   you are confident does not apply. Appeals take days; keep steps 1 to 4 going
   in parallel.

### Guideline 4.3(a), "Spam" (similar binary, metadata, or concept)

This is the rejection we got on the first 1.0 submission (build 13, Aug 2026).
It means the reviewer pattern-matched us against the pile of "remote control
for Claude Code / Codex" apps in the category; it says nothing about the
build's quality and it is not resolved by resubmitting the same metadata.

1. Reply in the submission's message thread before resubmitting, and make the
   reply about *identity*, not features: Superset is our own product, the
   mobile app is its official client, the source is public in this repository
   (`apps/mobile`), the bundle id is our domain, and the app only works with
   Superset accounts and hosts. Link the GitHub repository, the desktop app
   download, and a screen recording that shows the desktop app and the phone
   app driving the same session.
2. Make the product page say the same thing. Title keeps the brand; the
   subtitle and the first sentence of the description should name Superset as
   the product the app pairs with, not a generic "run AI agents from
   anywhere". Generic metadata is what the reviewer matched on.
3. Ask for a call in the same thread. 4.3(a) is a judgment call, and the
   person who calls can clear it on the spot once they see the desktop app.
4. Resubmit only after 1 and 2 are done, so the next reviewer reads the
   explanation alongside the new metadata.

## When the build is stuck in review

"Waiting for Review" or "In Review" with no verdict after 48 hours:

1. File an [expedited review request](https://developer.apple.com/contact/app-store/?topic=expedite).
   Low odds on its own, but support will ask whether you did.
2. Call Developer Support (step 4 above) and ask them to check on the
   submission. Repeat daily.
3. Do **not** cancel and resubmit a build that is merely slow; that puts it at
   the back of the queue. Cancel and resubmit only when you have an actual
   change to ship.
4. Email `devescalations@apple.com` (with the submission ID in the first line)
   if a week has passed with no response from the phone route.

## What to avoid

- Removing a feature to "get past" a reviewer, then re-adding it the next
  release. It works once and then the app is flagged.
- Replying to a rejection with a paragraph of justification and no build or
  recording.
- Bumping the major version or going months between submissions right before
  a launch.
- Any copy that reads as "build and run apps on your phone". Superset Mobile
  operates agents that run elsewhere; the wording in `store.config.js` and in
  the app should always say so.
