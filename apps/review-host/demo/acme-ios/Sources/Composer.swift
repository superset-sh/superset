import SwiftUI

struct Composer: View {
    @State private var text: String = ""

    var body: some View {
        HStack {
            TextField("Message", text: $text)
            Button("Send") { send() }
        }
        .padding()
    }

    private func send() {
        text = ""
    }
}
