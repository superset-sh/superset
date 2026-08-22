import SwiftUI
import UIKit

/// The overlay covers the whole screen so SwiftUI gets a real full-screen safe
/// area — that is the entire reason the composer is a child view controller
/// rather than a view in the React Native tree. But covering the screen means
/// covering the list behind it, so everything outside the composer's own frame
/// has to fall through.
///
/// Wraps the hosting view rather than replacing it. `UIHostingController`
/// builds its own view inside `loadView`, so a subclass that assigns one first
/// just has it thrown away — the SwiftUI view ends up with stock hit-testing
/// and the overlay eats every touch meant for the screen behind it.
final class ComposerPassthroughView: UIView {
  /// The composer's own frame, in window coordinates, reported by the SwiftUI
  /// tree. Everything outside it falls through to the screen behind.
  ///
  /// This looks like the seam that makes today's `GlassComposer` painful, so it
  /// was worth attacking: the obvious replacement is to ask UIKit what was hit
  /// and pass through when the answer is the hosting view itself. **That was
  /// tried and it does not work.** SwiftUI services taps on non-control content
  /// — the collapsed draft preview, the surface's own tap target — with
  /// recognizers attached to the hosting view rather than child platform views,
  /// so "the hit was the hosting view" is indistinguishable from "the hit was
  /// nothing", and real taps on the pill fell through to the list underneath.
  ///
  /// The frame stays. It differs from the `GlassComposer` seam in the way that
  /// matters: it never crosses into React Native and never drives layout, only
  /// hit-testing, so a stale value costs at most one misrouted tap mid-animation
  /// rather than mispositioning the composer.
  var interactiveFrame: CGRect = .zero

  /// Files and images pasted into the composer.
  ///
  /// SwiftUI has no paste hook on iOS — `onPasteCommand` and `pasteDestination`
  /// are both `@available(iOS, unavailable)`, and `PasteButton` is a button
  /// rather than the edit menu. UIKit's route is a paste configuration, and the
  /// responder chain is what makes it cheap: the text field stays exactly as it
  /// is and keeps taking strings, while anything it cannot represent walks up
  /// to this view instead. No editor of our own to maintain.
  var onPaste: (([ComposerPastedItem]) -> Void)?

  override var pasteConfiguration: UIPasteConfiguration? {
    get {
      UIPasteConfiguration(
        acceptableTypeIdentifiers: ComposerPastedItem.acceptableTypeIdentifiers
      )
    }
    set {}
  }

  override func paste(itemProviders: [NSItemProvider]) {
    Task { @MainActor in
      let items = await ComposerPastedItem.load(from: itemProviders)
      guard !items.isEmpty else { return }
      onPaste?(items)
    }
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard interactiveFrame.contains(convert(point, to: nil)) else { return nil }
    return super.hitTest(point, with: event)
  }
}

/// Attaches the composer over one screen's view controller and tears it down
/// again. Owned by `ComposerAnchorView`, which follows React's mount lifecycle.
final class ComposerOverlayController {
  private var hosting: UIHostingController<ComposerRootView>?
  private weak var container: ComposerPassthroughView?

  /// Owned here and injected into the SwiftUI tree once. Props mutate it; the
  /// root view is never reassigned.
  let model = ComposerModel()

  func attach(to parent: UIViewController) {
    guard hosting == nil else { return }

    let passthrough = ComposerPassthroughView()
    passthrough.backgroundColor = .clear
    model.onInteractiveFrameChange = { [weak passthrough] frame in
      passthrough?.interactiveFrame = frame
    }
    passthrough.onPaste = { [weak model] items in
      model?.onPaste?(items)
    }
    let controller = UIHostingController(rootView: ComposerRootView(model: model))
    controller.view.backgroundColor = .clear

    hosting = controller
    container = passthrough
    // The app is dark-only. Setting it on the controller rather than through
    // the SwiftUI environment is what reaches the UIKit-backed pieces too —
    // keyboard appearance, text selection handles, the caret.
    controller.overrideUserInterfaceStyle = .dark

    parent.addChild(controller)
    parent.view.addSubview(passthrough)
    passthrough.addSubview(controller.view)

    passthrough.translatesAutoresizingMaskIntoConstraints = false
    controller.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      passthrough.topAnchor.constraint(equalTo: parent.view.topAnchor),
      passthrough.bottomAnchor.constraint(equalTo: parent.view.bottomAnchor),
      passthrough.leadingAnchor.constraint(equalTo: parent.view.leadingAnchor),
      passthrough.trailingAnchor.constraint(equalTo: parent.view.trailingAnchor),
      controller.view.topAnchor.constraint(equalTo: passthrough.topAnchor),
      controller.view.bottomAnchor.constraint(equalTo: passthrough.bottomAnchor),
      controller.view.leadingAnchor.constraint(equalTo: passthrough.leadingAnchor),
      controller.view.trailingAnchor.constraint(equalTo: passthrough.trailingAnchor),
    ])
    controller.didMove(toParent: parent)
  }

  func detach() {
    guard let controller = hosting else { return }
    controller.willMove(toParent: nil)
    container?.removeFromSuperview()
    controller.view.removeFromSuperview()
    controller.removeFromParent()
    hosting = nil
    container = nil
  }
}
