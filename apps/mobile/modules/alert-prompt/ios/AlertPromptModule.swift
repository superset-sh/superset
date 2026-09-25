import ExpoModulesCore
import UIKit

internal struct PromptOptions: Record {
  @Field var title: String = ""
  @Field var message: String?
  @Field var defaultValue: String?
  @Field var placeholder: String?
  @Field var confirmText: String = "OK"
  @Field var cancelText: String = "Cancel"
  @Field var selectText: Bool = false
}

public final class AlertPromptModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AlertPrompt")

    AsyncFunction("prompt") { (options: PromptOptions, promise: Promise) in
      guard let currentViewController = self.appContext?.utilities?.currentViewController() else {
        promise.resolve(nil)
        return
      }

      let alert = UIAlertController(
        title: options.title,
        message: options.message,
        preferredStyle: .alert
      )
      alert.addTextField { textField in
        textField.text = options.defaultValue
        textField.placeholder = options.placeholder
      }
      alert.addAction(UIAlertAction(title: options.cancelText, style: .cancel) { _ in
        promise.resolve(nil)
      })
      alert.addAction(UIAlertAction(title: options.confirmText, style: .default) { _ in
        promise.resolve(alert.textFields?.first?.text)
      })

      currentViewController.present(alert, animated: true) {
        guard options.selectText, let textField = alert.textFields?.first else {
          return
        }
        textField.selectedTextRange = textField.textRange(
          from: textField.beginningOfDocument,
          to: textField.endOfDocument
        )
      }
    }.runOnQueue(.main)
  }
}
