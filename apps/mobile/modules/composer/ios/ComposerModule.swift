import ExpoModulesCore
import SwiftUI
import UIKit

public final class ComposerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Composer")

    View(ComposerAnchorView.self) {
      Events(
        "onSubmit",
        "onAttachmentsPress",
        "onDictationError",
        "onModelPress",
        "onChipPress",
        "onQuickKeyPress",
        "onPaste",
        "onDraftChange",
        "onHeightChange",
        "onRemoveAttachment",
        "onAttachmentPress",
        "onExpandedChange"
      )

      Prop("placeholder") { (view: ComposerAnchorView, placeholder: String) in
        view.overlay.model.placeholder = placeholder
      }

      /// Whatever this surface had typed when it was last open. Applied once —
      /// see `ComposerModel.applyInitialDraft`.
      Prop("initialDraft") { (view: ComposerAnchorView, text: String) in
        view.overlay.model.applyInitialDraft(text)
      }

      Prop("backdrop") { (view: ComposerAnchorView, backdrop: String) in
        view.overlay.model.backdrop = ComposerBackdrop(rawValue: backdrop) ?? .dim
      }

      /// Wrapped in a transaction, not left to an `.animation(_:value:)` on
      /// the SwiftUI side. The tray changing resizes the whole card, and only a
      /// real transaction reaches the parent that positions it — without this
      /// the card jumps to its new height and the rows slide into place inside
      /// it. See `ComposerMetrics.growth`.
      Prop("attachments") { (view: ComposerAnchorView, attachments: [ComposerAttachment]) in
        withAnimation(ComposerMetrics.growth) {
          view.overlay.model.attachments = attachments
        }
      }

      Prop("selectedModel") { (view: ComposerAnchorView, model: ComposerMenuOption?) in
        withAnimation(ComposerMetrics.controlSwap) {
          view.overlay.model.selectedModel = model
        }
      }

      /// Send becomes a spinner and the mic steps aside, which relays out the
      /// control row — same transaction rule as everything else that moves it.
      Prop("isSending") { (view: ComposerAnchorView, isSending: Bool) in
        withAnimation(ComposerMetrics.controlSwap) {
          view.overlay.model.isSending = isSending
        }
      }

      /// The terminal's keys above the card. Same transaction rule: the strip
      /// appearing or changing resizes the whole cluster.
      Prop("quickKeys") { (view: ComposerAnchorView, keys: [ComposerQuickKey]) in
        withAnimation(ComposerMetrics.growth) {
          view.overlay.model.quickKeys = keys
        }
      }

      Prop("showAttachments") { (view: ComposerAnchorView, shows: Bool) in
        withAnimation(ComposerMetrics.controlSwap) {
          view.overlay.model.showsAttachments = shows
        }
      }

      /// The terminal wants `never` — a shell command is not a sentence.
      Prop("autocapitalization") { (view: ComposerAnchorView, mode: String) in
        view.overlay.model.autocapitalization = mode == "never" ? .never : .sentences
      }

      /// Same reasoning as `attachments`: the chip row is a whole row of card
      /// height appearing or leaving.
      Prop("headerChips") { (view: ComposerAnchorView, chips: [ComposerMenuOption]) in
        withAnimation(ComposerMetrics.growth) {
          view.overlay.model.headerChips = chips
        }
      }

      /// React Native clears the draft once its own delivery succeeded, so a
      /// failed send keeps what the user typed.
      AsyncFunction("clear") { (view: ComposerAnchorView) in
        view.overlay.model.clearDraft()
      }.runOnQueue(.main)

      /// Re-open after something else took first responder — an attachments
      /// sheet, a picker — so the keyboard and the draft come back together.
      /// Dictation's transcript. Appends to whatever is already typed.
      AsyncFunction("appendDraft") { (view: ComposerAnchorView, text: String) in
        view.overlay.model.appendDraft(text)
      }.runOnQueue(.main)

      AsyncFunction("focus") { (view: ComposerAnchorView) in
        view.overlay.model.requestFocus()
      }.runOnQueue(.main)

      AsyncFunction("blur") { (view: ComposerAnchorView) in
        view.overlay.model.requestBlur()
      }.runOnQueue(.main)
    }
  }
}

/// A zero-size view in the React Native tree whose only job is lifecycle: it
/// mounts and unmounts with React, and attaches the real composer as a child
/// view controller of the screen it lands on.
///
/// The composer deliberately occupies no layout space — it floats over a list
/// that does not shift, so callers reserve room for it with a content inset
/// instead.
final class ComposerAnchorView: ExpoView {
  let overlay = ComposerOverlayController()

  private let onSubmit = EventDispatcher()
  private let onAttachmentsPress = EventDispatcher()
  private let onDictationError = EventDispatcher()
  private let onModelPress = EventDispatcher()
  private let onChipPress = EventDispatcher()
  private let onQuickKeyPress = EventDispatcher()
  private let onPaste = EventDispatcher()
  private let onDraftChange = EventDispatcher()
  private let onHeightChange = EventDispatcher()
  private let onRemoveAttachment = EventDispatcher()
  private let onAttachmentPress = EventDispatcher()
  private let onExpandedChange = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    overlay.model.onSubmit = { [weak self] text in self?.onSubmit(["text": text]) }
    overlay.model.onAttachmentsPress = { [weak self] in self?.onAttachmentsPress([:]) }
    overlay.model.onDictationError = { [weak self] message in
      self?.onDictationError(["message": message])
    }
    overlay.model.onModelPress = { [weak self] in self?.onModelPress([:]) }
    overlay.model.onQuickKeyPress = { [weak self] id in
      self?.onQuickKeyPress(["id": id])
    }
    overlay.model.onPaste = { [weak self] items in
      self?.onPaste([
        "items": items.map { item in
          ["uri": item.uri, "name": item.name, "kind": item.isImage ? "image" : "file"]
        }
      ])
    }
    overlay.model.onDraftChange = { [weak self] text in
      self?.onDraftChange(["text": text])
    }
    overlay.model.onHeightChange = { [weak self] height in
      self?.onHeightChange(["height": height])
    }
    overlay.model.onChipPress = { [weak self] id in self?.onChipPress(["id": id]) }
    overlay.model.onRemoveAttachment = { [weak self] id in
      self?.onRemoveAttachment(["id": id])
    }
    overlay.model.onAttachmentPress = { [weak self] id in
      self?.onAttachmentPress(["id": id])
    }
    overlay.model.onExpandedChange = { [weak self] expanded in
      self?.onExpandedChange(["expanded": expanded])
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // Covers unmount and navigating away: Fabric drops events from unmounted
    // screens, so leaving the window is the signal we can rely on.
    guard window != nil, let parent = owningViewController() else {
      overlay.detach()
      return
    }
    overlay.attach(to: parent)
  }

  /// The screen's own view controller, not the app's topmost one — the overlay
  /// belongs to this screen and must leave with it.
  private func owningViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }
}
