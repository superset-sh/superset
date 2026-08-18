# Composer widget: voice input states

This ExecPlan is a living document; keep `Progress` and `Decision Log` updated as work proceeds.

## Purpose / Big Picture

The home composer (`screens/(authenticated)/(home)/home/components/NewChatWidget/`) has live dictation wired (`useVoiceDictation` on expo-speech-recognition, permissions baked into the dev client) but the recording flow fights the normal composer: the send button replaces the stop button mid-recording because `showSend` reacts to the interim transcript. Voice is an *input method*, not a parallel flow — it appends transcript into the field, and afterwards the user submits normally. This plan defines only the voice-specific states and their button-slot behavior.

## States

Only two states are voice-specific; everything else is the composer's existing behavior (send appears when there's content, spins while the workspace/agent create is in flight) and stays untouched.

| State | Trigger slot (right) | Send | + button | Text field |
|---|---|---|---|---|
| normal | mic, always | appears **beside** the mic when there's content (today send *replaces* the mic — existing bug, fix in Milestone 1) | enabled | editable |
| `recording` | recording pill, copied from the iOS system dictation pill: stop square + elapsed `m:ss` + live voice-level bars; tapping anywhere on the pill stops | **hidden** | enabled — nothing dims | stays editable; nothing streams — the transcript appends to whatever the field holds when it lands, cursor placed at the end |
| `finalizing` (stop tapped, transcription in flight) | the mic button in a loading state: same bordered circle, `ProgressView` spinner as content | hidden | enabled | editable |

Transitions:
- normal → `recording`: mic tap (permission prompt first run).
- `recording` → `finalizing`: stop tap, or the recognizer's own `end` (silence timeout, route change, backgrounding).
- `finalizing` → normal: final result appended into the field; composer takes over from there.
- Errors (`not-allowed`, `no-speech`, network): alert + return to normal, keeping whatever text existed before recording.

## Component structure

The voice pill's interface is locked down so composer work and voice work can proceed independently. `useVoiceDictation` owns the state machine and returns a discriminated union — consumers switch on `status` and can't read fields that don't exist in that state:

    // hooks/useVoiceDictation/useVoiceDictation.ts
    export type VoiceDictation =
      | { status: "idle"; start: () => Promise<void> }
      | { status: "recording"; startedAt: number; stop: () => void }
      | { status: "finalizing" };

    export function useVoiceDictation(draft: {
      read: () => string;             // read when the transcript lands → the append base
      write: (text: string) => void;  // fires at most ONCE with `${base} ${transcript}`
    }): VoiceDictation;

The hook composes append semantics internally (Milestone 3) and owns the transcriber (Apple final result today, server batch STT later — see Decision Log); the widget just hands it draft accessors (the ref pair from the Decision Log's re-render entry, not state setters). Errors resolve inside the hook — alert + revert to `idle` with the base text restored — so no error state leaks into the union.

The trigger slot renders one component that dispatches on status (per repo co-location rules, one component per file):

    NewChatWidget/
    ├── NewChatWidget.tsx                    # slot logic only, see contract below
    ├── components/
    │   └── VoiceControl/
    │       ├── VoiceControl.tsx             # props: { dictation: VoiceDictation } — mic (idle) or dispatch
    │       ├── components/
    │       │   ├── RecordingPill/           # stop square + elapsed m:ss + level bars; whole pill = stop.
    │       │   │   │                        #   Owns its own 1s ticker so the tick re-renders the pill
    │       │   │   │                        #   subtree, not the Host
    │       │   │   └── components/
    │       │   │       └── VoiceLevelBars/  # the "detecting voice" meter: bars driven by the recognizer's
    │       │   │                            #   volumechange events (~100ms); each capsule pinned to the
    │       │   │                            #   bottom of a fixed full-height frame so bars grow upward
    │       │   │                            #   with zero layout shift; subscribes to the module event
    │       │   │                            #   directly so level updates re-render only the bars
    │       │   └── FinalizingChip/          # the mic button in a loading state: same bordered circle,
    │       │                                #   SwiftUI ProgressView as its content
    │       └── index.ts
    └── hooks/useVoiceDictation/

Composer integration contract (the only places NewChatWidget knows about voice):

- `showSend = hasDraft && dictation.status === "idle"` — recording/finalizing own the slot unconditionally (Milestone 1).
- Slot: `<VoiceControl dictation={dictation}/>` renders **always** (mic when idle, pill/spinner otherwise); `showSend` adds the send button *beside* it rather than replacing it, in both the collapsed row and the expanded toolbar. (Today send replaces the mic — that replacement is the bug Milestone 1 also fixes.)
- No dimming or freezing: the composer stays fully interactive while voice is active — only the trigger slot changes, and send stays hidden.
- `animationKey` folds in `dictation.status` and `showSend` so the glass morphs on state changes, same as today.

## Milestones

1. **Bug fix (do first), two halves of the same slot rework:** (a) recording/finalizing own the button slot unconditionally — `showSend` becomes `hasDraft && status === "idle"`; today the interim transcript flips `showSend` and the stop button disappears mid-recording. (b) With a draft, send renders **beside** the mic instead of replacing it; today's replacement is a bug (confirmed by Satya, 2026-07-10).
2. **Bug fix (from the 2026-07-10 code review, do with 1):** the composer clears text/attachments/base-branch in `mutateAsync().then()`, but the mutation resolves even when the workspace was created and the first agent message failed (`agentResult.ok === false` in `useCreateChatWorkspace`) — the user gets "Chat failed to start" with the prompt already destroyed and an orphaned empty workspace left behind. Clear only on `agentResult.ok`. Dictation raises the stakes: a spoken prompt is the most painful kind to retype.
3. Append semantics: capture the field's value at recording start and write `${base} ${transcript}` once when the final transcript lands, so dictating adds to typed text instead of replacing it (matters for dictating twice or after typing).
4. Recording pill matching the iOS system dictation pill (reference screenshot in the mock): stop square + elapsed timer (tick from recording start timestamp) + `VoiceLevelBars` reacting to the recognizer's `volumechange` events; whole pill tappable to stop; disable + and field editing during recording.
5. Finalizing: stop → `continuous` recognizer flushes its final result → write + back to normal; system spinner (SwiftUI `ProgressView`) while it flushes.
6. Real-device verification (simulator has no speech recognition): record with long thinking pauses (must NOT auto-stop), permission-deny, backgrounding mid-recording, dictate-after-typing, dictate-twice, and the Milestone 2 partial-failure path (kill the host between workspace creation and the first message; draft must survive).
7. ~~Batch STT upgrade~~ — built, A/B'd on device against native, and removed: native won (see Decision Log).

## Progress

- [x] (2026-07-11) Plumbing landed: `useVoiceDictation`, mic/stop swap, mic + speech permission strings in Info.plist (requires `expo prebuild` — once `apps/mobile/ios/` exists, `run:ios` alone does not re-apply config plugins).
- [x] (2026-07-10) Full-session code review run; the two composer-scoped findings folded in as Milestone 2 and the Decision Log re-render entry. Verified non-issue from the same review: the widget's hardcoded dark palette (`#e5e5e5`/`#8e8e93`) cannot misrender — the app is dark-locked at the OS (`userInterfaceStyle: "dark"`), uniwind (`Uniwind.setTheme("dark")`), and SwiftUI (`environment("colorScheme", "dark")`) levels.
- [x] (2026-07-10) States + component interface mocked for sync (https://claude.ai/code/artifact/81f2e045-25a6-4af2-a8f6-9dfdd38b1249). Satya's corrections folded in: mic + send coexist on draft (today's replacement is a bug), recording pill copies the iOS system dictation pill (neutral glass, stop square + timer + live level bars — reference screenshot in the mock), finalizing uses the system spinner.
- [x] (2026-07-10) Direction change from Satya: transcribe at the end, never during (`continuous: true`, no interims); consider OpenAI batch STT as the step-2 transcriber (Milestone 7).
- [x] (2026-07-10) Milestones 1–5 implemented: slot rework (idle guard + mic/send coexistence), success-gated composer clear, draft-ref architecture, `VoiceControl`/`RecordingPill`/`VoiceLevelBars`/`FinalizingChip`, end-of-recording transcription. Lint + typecheck green; sim-verified idle state renders (mic in slot).
- [x] (2026-07-10) Milestone 7 implemented after first device round: `transcription.transcribe` tRPC mutation (protected, OpenAI `gpt-4o-transcribe`, `OPENAI_API_KEY` optional in trpc env — 412 when missing); audio recorded as 16kHz 16-bit wav (`recordingOptions.persist`), uploaded base64 (~90s cap from the serverless body limit), Apple final result as silent fallback, 15s finalize timeout. Device feedback folded in: no dimming/freezing anywhere (field stays editable; transcript appends to current contents), silent no-speech (no alerts except permission), cursor to end of injected text via `setSelection`, bars bottom-pinned in fixed frames (`frame({alignment:"bottom"})`) to kill the layout shift, finalizing = mic button with `ProgressView` content. End-to-end verified on the simulator: recorded ambient audio transcribed and injected ("focusing").
- [x] (2026-07-10) A/B on device: native transcription chosen; OpenAI endpoint, env key, and hook branch deleted. All added comments stripped per Satya.
- [ ] Milestone 6: final device pass — bar growth direction, cursor landing, long-pause recordings, dictate-after-typing, empty-audio silent path.

## Decision Log

- Voice is an input method, not a flow: no dedicated draft/submitting states — after finalizing, the normal composer handles everything.
- (2026-07-10, REVERSES the live-dictation decision below, Satya) Transcribe at the END of the recording, never while the user talks, and never auto-stop on silence: `continuous: true`, `interimResults: false`, `write` fires once with the final transcript. Rationale: batch transcription consistently outperforms streaming on accuracy, silence auto-stop truncates thinking pauses, and nothing needs to stream visually — the level bars carry the "it's hearing you" signal. Bonus: with no interim writes, the streaming re-render concern disappears entirely (the draft-ref architecture stays for typing).
- (2026-07-10, RESOLVED by on-device A/B, Satya) Native Apple final result WINS: quality is good and it settles near-instantly. The OpenAI `gpt-4o-transcribe` path was fully built (protected `transcription.transcribe` tRPC mutation, 16kHz wav via `recordingOptions.persist`, base64 upload, `OPENAI_API_KEY` in trpc env) and then deleted after the comparison — rebuild from this description if Apple's quality ever regresses; the `VoiceDictation` interface hides the transcriber, so it's a hook-internals-only change. Settle order in the native flow: the final result event settles immediately; if it never comes (stopped during silence), `audioend` + a 500ms grace settles with nothing; a 15s timeout backstops pathological cases.
- ~~Live dictation over record-then-transcribe: streaming is already built, native to iOS, and shows text immediately; batch STT would need audio capture + a server endpoint. Revisit only if on-device quality disappoints.~~ (Reversed above.)
- Simulator cannot exercise any of this; all verification on a physical device.
- (2026-07-10, from code review) Draft text must not live in provider `useState`: today every keystroke flows through `controller.textInput.setInput` → new context value → `NewChatWidgetInner` re-renders the entire SwiftUI Host tree. Typing makes that a per-keystroke cost; interim dictation results would make it fire at speech rate. Target shape: draft in a ref, a `hasDraft` boolean as the only text-derived state, submit/dictation read the ref. Milestone 3's streaming append builds on this rather than `setInput`.
