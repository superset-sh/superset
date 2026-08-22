import ExpoModulesCore
import UIKit

public final class ComposerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Composer")

    View(ComposerAnchorView.self) {
      Events(
        "onSubmit",
        "onAttachmentsPress",
        "onDictatePress",
        "onModelPress",
        "onRemoveAttachment",
        "onAttachmentPress",
        "onExpandedChange"
      )

      Prop("placeholder") { (view: ComposerAnchorView, placeholder: String) in
        view.overlay.model.placeholder = placeholder
      }

      Prop("backdrop") { (view: ComposerAnchorView, backdrop: String) in
        view.overlay.model.backdrop = ComposerBackdrop(rawValue: backdrop) ?? .dim
      }

      Prop("attachments") { (view: ComposerAnchorView, attachments: [ComposerAttachment]) in
        view.overlay.model.attachments = attachments
      }

      /// React Native clears the draft once its own delivery succeeded, so a
      /// failed send keeps what the user typed.
      AsyncFunction("clear") { (view: ComposerAnchorView) in
        view.overlay.model.draft = ""
      }.runOnQueue(.main)

      /// Re-open after something else took first responder — an attachments
      /// sheet, a picker — so the keyboard and the draft come back together.
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
  private let onDictatePress = EventDispatcher()
  private let onModelPress = EventDispatcher()
  private let onRemoveAttachment = EventDispatcher()
  private let onAttachmentPress = EventDispatcher()
  private let onExpandedChange = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    overlay.model.onSubmit = { [weak self] text in self?.onSubmit(["text": text]) }
    overlay.model.onAttachmentsPress = { [weak self] in self?.onAttachmentsPress([:]) }
    overlay.model.onDictatePress = { [weak self] in self?.onDictatePress([:]) }
    overlay.model.onModelPress = { [weak self] in self?.onModelPress([:]) }
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
