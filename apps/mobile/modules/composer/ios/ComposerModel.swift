import Observation
import SwiftUI

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
  @ObservationIgnored var onDictatePress: (() -> Void)?
  @ObservationIgnored var onModelPress: (() -> Void)?
  @ObservationIgnored var onChipPress: ((String) -> Void)?
  @ObservationIgnored var onRemoveAttachment: ((String) -> Void)?
  @ObservationIgnored var onAttachmentPress: ((String) -> Void)?
  /// Lets the caller restore the composer only when it was actually open —
  /// re-focusing unconditionally after a sheet pops the keyboard back up over a
  /// composer the user had left collapsed.
  @ObservationIgnored var onExpandedChange: ((Bool) -> Void)?
  /// Internal plumbing, not a React Native event — see `ComposerPassthroughView`.
  @ObservationIgnored var onInteractiveFrameChange: ((CGRect) -> Void)?

  var hasContent: Bool { hasDraft || !attachments.isEmpty }

  var hasDraft: Bool {
    !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// The composer does not clear itself. React Native clears through the view
  /// once its own delivery succeeded, so a failed send keeps the draft — the
  /// same contract `GlassComposer` settled on.
  func submit() {
    guard hasContent else { return }
    onSubmit?(draft)
  }
}
