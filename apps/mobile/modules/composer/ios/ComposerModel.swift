import Observation
import SwiftUI
import UIKit

/// State and callbacks shared between the Expo view and the SwiftUI tree.
///
/// The controller owns one of these and injects it into `ComposerRootView`
/// once. Props then mutate the model rather than replacing the root view, which
/// matters as soon as there is more than one of them: reassigning `rootView`
/// for every prop change means rebuilding the closure set each time, and it
/// gives React Native no way to read anything back out — the draft has to be
/// readable at submit time and clearable afterwards.
enum ComposerBackdrop: String {
  case dim
  case passthrough
}

@Observable
final class ComposerModel {
  var placeholder = ""
  var draft = ""

  /// How the composer treats the screen behind it while expanded.
  ///
  /// `.dim` is the mocks' behaviour: the composer owns the screen, dims it, and
  /// an outside tap dismisses. `.passthrough` leaves the content behind fully
  /// live so it can be scrolled while typing — what a chat transcript wants.
  /// In that mode the caller owns dismissal, because nothing is intercepting
  /// the outside tap any more.
  var backdrop: ComposerBackdrop = .dim

  /// Mirrors React Native's tray. The composer renders it and reports removals
  /// and taps back out; it never owns the list.
  var attachments: [ComposerAttachment] = []

  /// The currently selected agent. Nil hides the picker, which is what the
  /// terminal surface wants. The list itself lives in React Native — see
  /// `ComposerModelPicker`.
  var selectedModel: ComposerMenuOption?

  /// A submit is in flight. The caller owns this — only it knows when delivery
  /// finished — and while it is true the send button shows a spinner and the
  /// mic gets out of the way.
  var isSending = false

  /// Dictation runs natively — see `ComposerDictation` for why it is not a
  /// mirror of the React Native hook.
  let dictation = ComposerDictation()

  var isDictating: Bool { dictation.isActive }

  /// The terminal's quick keys, above the card. Empty on every other surface.
  var quickKeys: [ComposerQuickKey] = []

  /// The workspace's sessions, above the quick keys. Empty on every other
  /// surface, which is also how the strip stays off the home composer.
  var sessionTabs: [ComposerSessionTab] = []

  /// Every string the strip draws, translated in React Native — the composer
  /// has no catalog. See `ComposerSessionTabLabels`.
  var sessionTabLabels = ComposerSessionTabLabels()

  /// The strip's leading control. Nil on every surface with nothing to link
  /// to, which is all of them but the workspace terminal.
  var sessionAction: ComposerSessionAction?

  /// What the active agent can run behind `/` (or `$`). Empty hides the
  /// suggestion panel entirely — a plain shell, an agent without discovery,
  /// or a host too old to answer all land here the same way.
  var slashCommands: [ComposerSlashCommand] = []

  /// The panel's contents, derived from the draft. Nil while the draft is
  /// anything other than a bare trigger token.
  var slashSuggestions: ComposerSlashSuggestionState? {
    ComposerSlashMatching.suggestions(draft: draft, commands: slashCommands)
  }

  /// Selection is textual: the draft becomes the committed token and the
  /// caller hears about it through `onDraftChange` like any keystroke. The
  /// trailing space is what lets an argument-taking command close the panel
  /// and start its arguments in one motion.
  func commitSlashCommand(_ command: ComposerSlashCommand) {
    setDraft(command.trigger + command.name + " ")
  }

  /// Whether the `+` button is offered. A plain shell would try to *execute* an
  /// attachment path, so only agent sessions get it.
  var showsAttachments = true

  /// The terminal wants `never`; prose surfaces want sentences.
  var autocapitalization: TextInputAutocapitalization = .sentences

  /// Frame 4's header row — project+branch and target. Same shape as the model
  /// options; their menus arrive with the data at cutover, so for now a press
  /// is reported and the caller decides what to present.
  var headerChips: [ComposerMenuOption] = []

  /// Bumped to ask the composer to take or resign focus. A counter rather than
  /// a Bool so two consecutive requests of the same kind both land — the second
  /// would otherwise be a no-op change and never fire an observer.
  private(set) var focusRequest = 0
  private(set) var blurRequest = 0

  func requestFocus() { focusRequest += 1 }
  func requestBlur() { blurRequest += 1 }

  /// Set by `ComposerAnchorView` to forward into Expo's `EventDispatcher`s.
  /// Not `@ObservationIgnored`-worthy noise: they are assigned once at attach.
  @ObservationIgnored var onSubmit: ((String) -> Void)?
  @ObservationIgnored var onAttachmentsPress: (() -> Void)?
  /// Surfaced so the caller can show its own alert; dictation itself needs no
  /// round trip.
  @ObservationIgnored var onDictationError: ((String) -> Void)?
  @ObservationIgnored var onModelPress: (() -> Void)?
  @ObservationIgnored var onChipPress: ((String) -> Void)?
  @ObservationIgnored var onQuickKeyPress: ((String) -> Void)?
  /// The session strip reports by id and knows nothing else. Selecting swaps
  /// which terminal is attached, closing raises React Native's confirm before
  /// anything is killed, and copying puts the terminal id on the pasteboard
  /// there — where the "Copied" notice already lives.
  @ObservationIgnored var onSessionTabPress: ((String) -> Void)?
  @ObservationIgnored var onSessionTabClose: ((String) -> Void)?
  @ObservationIgnored var onSessionTabCopyId: ((String) -> Void)?
  @ObservationIgnored var onNewSessionPress: (() -> Void)?
  @ObservationIgnored var onAllSessionsPress: (() -> Void)?
  /// The leading control was pressed. Where it goes is React Native's to know.
  @ObservationIgnored var onSessionActionPress: (() -> Void)?
  /// Files and images pasted into the field, already written to disk. The tray
  /// lives in React Native, so the composer hands over URIs and lets it add
  /// them the same way the pickers do.
  @ObservationIgnored var onPaste: (([ComposerPastedItem]) -> Void)?
  /// How much room the composer occupies above the bottom of the safe area —
  /// its card, the quick keys, and the gaps between them.
  ///
  /// The composer draws in an overlay and takes no React Native layout space,
  /// so a caller with content underneath cannot measure it and has no other way
  /// to know how far to inset. Deliberately excludes the keyboard: the caller
  /// already tracks that, and it arrives there with a duration and a curve
  /// worth animating to.
  @ObservationIgnored var onHeightChange: ((CGFloat) -> Void)?
  @ObservationIgnored var onRemoveAttachment: ((String) -> Void)?
  @ObservationIgnored var onAttachmentPress: ((String) -> Void)?
  /// Lets the caller restore the composer only when it was actually open —
  /// re-focusing unconditionally after a sheet pops the keyboard back up over a
  /// composer the user had left collapsed.
  @ObservationIgnored var onExpandedChange: ((Bool) -> Void)?
  /// Reports every draft change out so React Native can keep a shadow copy for
  /// draft restore. Outward only, the way `onHeightChange` is: the composer
  /// stays the source of truth while the field is live, and nothing React
  /// Native holds is pushed back in mid-edit. A controlled `value` prop is the
  /// one shape that would break growth — the resize would land outside the
  /// transaction that revealed send.
  @ObservationIgnored var onDraftChange: ((String) -> Void)?

  /// First delivery of `initialDraft` wins; React Native pins the value at
  /// mount, so later deliveries are the same text and must not clobber typing.
  @ObservationIgnored private var hasAppliedInitialDraft = false

  /// Internal plumbing, not a React Native event — see `ComposerPassthroughView`.
  @ObservationIgnored var onInteractiveFrameChange: ((CGRect) -> Void)?

  var hasContent: Bool { hasDraft || !attachments.isEmpty }

  var hasDraft: Bool {
    !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// The composer does not clear itself. React Native clears through the view
  /// once its own delivery succeeded, so a failed send keeps the draft — the
  /// same contract `GlassComposer` settled on.
  /// Dictation appends rather than replaces, so speaking after typing adds to
  /// what is there. The base text lives here, so the append happens here too —
  /// React Native would otherwise have to mirror every keystroke back across
  /// the bridge just to read it at settle time.
  init() {
    dictation.onTranscript = { [weak self] text in self?.appendDraft(text) }
    dictation.onError = { [weak self] message in self?.onDictationError?(message) }
  }

  /// Every draft change goes through here so the transaction is always open
  /// when the text lands. A vertical `TextField` resizes through its UIKit text
  /// layout, which never joins a transaction an ancestor's `.animation(_:value:)`
  /// opened — and the same change reveals or hides send, so if the two are not
  /// in one transaction the mic travels along an arc.
  func setDraft(_ text: String) {
    withAnimation(ComposerMetrics.typingGrowth) { draft = text }
    onDraftChange?(text)
  }

  /// Empties the draft. Animated, so the card shrinks back, but reports
  /// nothing out: React Native calls this while clearing its own copy, so an
  /// echo would be a bridge round trip to tell the caller what it just did.
  func clearDraft() {
    withAnimation(ComposerMetrics.typingGrowth) { draft = "" }
  }

  /// The draft React Native saved for this surface, put back once as the view
  /// is set up.
  ///
  /// A prop rather than a call through the ref: at mount a ref call races the
  /// view's own creation and lands before there is anything to receive it,
  /// where a prop is delivered as part of setting the view up. Unanimated,
  /// because the composer is appearing rather than growing, and unreported,
  /// because React Native is where this text just came from.
  func applyInitialDraft(_ text: String) {
    guard !hasAppliedInitialDraft else { return }
    hasAppliedInitialDraft = true
    guard !text.isEmpty else { return }
    draft = text
  }

  func appendDraft(_ text: String) {
    let addition = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !addition.isEmpty else { return }
    let base = draft.trimmingCharacters(in: .whitespaces)
    setDraft(base.isEmpty ? addition : base + " " + addition)
  }

  func submit() {
    guard hasContent, !isSending else { return }
    onSubmit?(draft)
  }
}
