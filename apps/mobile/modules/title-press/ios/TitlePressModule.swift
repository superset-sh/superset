import ExpoModulesCore
import UIKit

public class TitlePressModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TitlePress")

    View(TitlePressView.self) {
      Events("onTitlePress")
    }
  }
}

/// Zero-size view placed anywhere inside a native stack screen. While mounted
/// it listens on the stack's UINavigationBar for taps that land on the
/// screen's own title label. The title stays UIKit's, so the bar keeps
/// truncating it against the back button and bar items on every width.
final class TitlePressView: ExpoView, UIGestureRecognizerDelegate {
  private let onTitlePress = EventDispatcher()
  private weak var navigationBar: UINavigationBar?
  private weak var controller: UIViewController?
  private var attachAttempts = 0

  private lazy var recognizer: UITapGestureRecognizer = {
    let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleTap))
    recognizer.cancelsTouchesInView = false
    recognizer.delegate = self
    return recognizer
  }()

  override func didMoveToWindow() {
    super.didMoveToWindow()
    attachAttempts = 0
    attach()
  }

  deinit {
    navigationBar?.removeGestureRecognizer(recognizer)
  }

  private func attach() {
    navigationBar?.removeGestureRecognizer(recognizer)
    navigationBar = nil
    guard window != nil, let controller = enclosingViewController() else { return }
    guard let bar = controller.navigationController?.navigationBar else {
      attachAttempts += 1
      if attachAttempts <= 5 {
        DispatchQueue.main.async { [weak self] in self?.attach() }
      }
      return
    }
    self.controller = controller
    bar.addGestureRecognizer(recognizer)
    navigationBar = bar
  }

  private func enclosingViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController {
        return controller
      }
      responder = current.next
    }
    return nil
  }

  private func titleLabel(at point: CGPoint, in view: UIView, text: String) -> UILabel? {
    for subview in view.subviews {
      let local = view.convert(point, to: subview)
      if let label = subview as? UILabel, label.text == text,
         label.bounds.insetBy(dx: -12, dy: -12).contains(local) {
        return label
      }
      if let found = titleLabel(at: local, in: subview, text: text) {
        return found
      }
    }
    return nil
  }

  private func isOnTitle(_ touchPoint: CGPoint) -> Bool {
    guard let bar = navigationBar, let controller,
          bar.topItem === controller.navigationItem,
          let title = controller.navigationItem.title, !title.isEmpty else { return false }
    return titleLabel(at: touchPoint, in: bar, text: title) != nil
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    guard let bar = navigationBar else { return false }
    return isOnTitle(touch.location(in: bar))
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    true
  }

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    guard let bar = navigationBar, isOnTitle(recognizer.location(in: bar)) else { return }
    onTitlePress()
  }
}
