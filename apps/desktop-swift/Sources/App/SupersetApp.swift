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

        // Phase 1: create the PTY session eagerly so output accumulates in the replay buffer.
        // The JS initTerminal call happens in didFinish navigation delegate after WebView loads.
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let sessionId = UUID().uuidString
        windowController.createPTYSession(sessionId: sessionId, cwd: home)

        windowController.loadWebContent()
        windowController.window.makeKeyAndOrderFront(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        PTYSessionManager.shared.destroyAll()
    }
}
