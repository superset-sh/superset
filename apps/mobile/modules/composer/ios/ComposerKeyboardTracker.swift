import SwiftUI
import UIKit

/// Lifts the composer for the keyboard its own editor raised, and nothing
/// else. The inset is applied in SwiftUI so the cluster rides the keyboard's
/// motion; a UIKit-side frame change lands in SwiftUI as a jump.
final class ComposerKeyboardTracker {
  private let model: ComposerModel
  private weak var container: UIView?
  private var observers: [NSObjectProtocol] = []

  init(model: ComposerModel, container: UIView) {
    self.model = model
    self.container = container
    let center = NotificationCenter.default
    observers = [
      center.addObserver(
        forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main
      ) { [weak self] in self?.keyboardWillChange($0) },
      center.addObserver(
        forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.apply(0) },
    ]
  }

  deinit {
    for observer in observers {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  private func keyboardWillChange(_ notification: Notification) {
    guard let container, let window = container.window,
      container.containsFirstResponder,
      let endFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
    else { return }
    let keyboard = container.convert(
      window.convert(endFrame, from: window.screen.coordinateSpace), from: window)
    let overlap = container.safeAreaLayoutGuide.layoutFrame.intersection(keyboard)
    apply(overlap.isNull ? 0 : overlap.height)
  }

  private func apply(_ inset: CGFloat) {
    guard model.keyboardInset != inset else { return }
    if model.isAppearing {
      model.keyboardInset = inset
    } else {
      // The keyboard's own curve, which it reports only as a private constant.
      withAnimation(.interpolatingSpring(mass: 3, stiffness: 1000, damping: 500)) {
        model.keyboardInset = inset
      }
    }
  }
}

extension UIView {
  var containsFirstResponder: Bool {
    isFirstResponder || subviews.contains(where: \.containsFirstResponder)
  }
}
