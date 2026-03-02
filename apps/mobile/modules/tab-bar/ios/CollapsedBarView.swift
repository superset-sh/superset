import SwiftUI

struct CollapsedBarView: View {
  let tabs: [TabItem]
  let selectedTab: String
  let onTabTap: (String) -> Void
  let onMenuTriggerTap: () -> Void

  var body: some View {
    HStack(spacing: 0) {
      ForEach(Array(tabs.enumerated()), id: \.element.name) { _, tab in
        Button {
          if tab.isMenuTrigger {
            onMenuTriggerTap()
          } else {
            onTabTap(tab.name)
          }
        } label: {
          ZStack {
            if !tab.isMenuTrigger && tab.name == selectedTab {
              RoundedRectangle(cornerRadius: 10)
                .fill(Color.white.opacity(0.12))
                .frame(width: 36, height: 36)
            }

            VStack(spacing: 2) {
              ZStack(alignment: .topTrailing) {
                Image(systemName: tab.icon)
                  .font(.system(size: 16, weight: .medium))
                  .foregroundStyle(
                    !tab.isMenuTrigger && tab.name == selectedTab
                      ? .white
                      : .white.opacity(0.6)
                  )

                if let badge = tab.badge, badge > 0 {
                  Text("\(badge)")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(Color.red, in: Capsule())
                    .offset(x: 8, y: -6)
                }
              }
            }
          }
          .frame(width: 48, height: 48)
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 4)
    .background(.ultraThinMaterial, in: Capsule())
  }
}
