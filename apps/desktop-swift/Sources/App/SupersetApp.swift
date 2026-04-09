import AppKit

@main
struct SupersetApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowController: MainWindowController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        windowController = MainWindowController()
        windowController.loadWebContent()
        windowController.window.makeKeyAndOrderFront(nil)

        // Phase 1: single terminal session pointing to home directory
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let sessionId = UUID().uuidString

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.windowController.createTerminal(sessionId: sessionId, cwd: home)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        PTYSessionManager.shared.destroyAll()
    }
}
