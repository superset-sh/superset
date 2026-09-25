import ExpoModulesCore

/// One slash command or skill the active agent can run, handed over as data.
///
/// Carries no behaviour, like `ComposerQuickKey`: selection is purely textual
/// — the composer replaces the draft with the committed token and the caller
/// hears about it through `onDraftChange` like any other keystroke.
struct ComposerSlashCommand: Record, Identifiable, Equatable {
  @Field var id: String = ""
  /// Full display name, namespace included (`agent-sdk-dev:new-sdk-app`).
  @Field var name: String = ""
  @Field var descriptionText: String? = nil
  /// The sigil that opens and commits this entry: `/`, or `$` for Codex skills.
  @Field var trigger: String = "/"
  /// Non-empty when the command takes arguments; the menu stays out of the
  /// way once such a command is fully typed.
  @Field var argumentHint: String? = nil
  /// Harness-shipped commands sort after user-defined ones, like desktop.
  @Field var isBuiltin: Bool = false
  /// Alternate names; matched after the canonical name, like desktop.
  @Field var aliases: [String] = []

  static func == (lhs: ComposerSlashCommand, rhs: ComposerSlashCommand) -> Bool {
    lhs.id == rhs.id && lhs.name == rhs.name
      && lhs.descriptionText == rhs.descriptionText
      && lhs.trigger == rhs.trigger && lhs.argumentHint == rhs.argumentHint
      && lhs.isBuiltin == rhs.isBuiltin && lhs.aliases == rhs.aliases
  }
}

/// The suggestion state derived from the draft — nil when the panel is hidden.
struct ComposerSlashSuggestionState: Equatable {
  var query: String
  var matches: [ComposerSlashCommand]
}

enum ComposerSlashMatching {
  /// The active token: the draft *is* a trigger token and nothing else — one
  /// sigil, no whitespace after it. Suggestions stay out of the way the
  /// moment the command gains arguments or the draft becomes prose.
  static func activeToken(draft: String) -> (trigger: String, query: String)? {
    guard let first = draft.first, first == "/" || first == "$" else { return nil }
    let query = String(draft.dropFirst())
    guard !query.contains(where: { $0.isWhitespace || $0.isNewline }) else { return nil }
    return (String(first), query)
  }

  /// Exact > prefix > substring, mirroring shared `getCommandMatchRank`.
  static func rank(name: String, query: String) -> Int? {
    if query.isEmpty { return 0 }
    let name = name.lowercased()
    if name == query { return 0 }
    if name.hasPrefix(query) { return 1 }
    if name.contains(query) { return 2 }
    return nil
  }

  /// Name rank wins; an alias match ranks three tiers back, like the shared
  /// helper, so aliases surface without outranking canonical names.
  static func rank(command: ComposerSlashCommand, query: String) -> Int? {
    if let nameRank = rank(name: command.name, query: query) { return nameRank }
    let aliasRanks = command.aliases.compactMap { rank(name: $0, query: query) }
    guard let best = aliasRanks.min() else { return nil }
    return best + 3
  }

  static func suggestions(
    draft: String,
    commands: [ComposerSlashCommand]
  ) -> ComposerSlashSuggestionState? {
    guard let token = activeToken(draft: draft), !commands.isEmpty else { return nil }
    let query = token.query.lowercased()
    // A fully typed command that takes arguments keeps the panel closed —
    // mirrors shared `shouldSuppressSlashMenuForCommittedCommand`.
    if commands.contains(where: { command in
      command.trigger == token.trigger
        && (command.name.lowercased() == query
          || command.aliases.contains { $0.lowercased() == query })
        && !(command.argumentHint ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }) {
      return nil
    }
    let matches = commands
      .compactMap { command -> (ComposerSlashCommand, Int)? in
        guard command.trigger == token.trigger else { return nil }
        guard let rank = rank(command: command, query: query) else { return nil }
        return (command, rank)
      }
      .sorted { lhs, rhs in
        if lhs.1 != rhs.1 { return lhs.1 < rhs.1 }
        if lhs.0.isBuiltin != rhs.0.isBuiltin { return !lhs.0.isBuiltin }
        return lhs.0.name < rhs.0.name
      }
      .map(\.0)
    guard !matches.isEmpty else { return nil }
    return ComposerSlashSuggestionState(query: query, matches: matches)
  }
}
