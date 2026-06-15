# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-15

### Added

- Show the current Pi thinking/effort level in the footer as a right-aligned `thinking: <level>` segment that updates when Shift+Tab changes the level.
- Add the configurable `thinking` footer segment and `display.hideThinking` opt-out, with existing configs showing thinking by default unless explicitly hidden.

### Changed

- Render the `thinking:` label brighter than the thinking level value for better footer readability.
- Show git-backed project labels as `<project>:<branch>` in the footer while keeping non-git folders as the folder name.

## [0.1.1] - 2026-06-12

### Changed

- Validate npm Trusted Publishing release automation for the public package.

## [0.1.0] - 2026-06-12

### Added

- Initial `pi-usage-bar` package for Pi: a custom footer/statusline backed by a local SQLite usage ledger.
- Per-session, per-project, per-model, and per-range usage rollups via `/usage` commands.
- Project attribution from git remotes, `Developer/gitroot` paths, aliases, and ambiguous root-dir warnings.
- One-time attribution moves, persistent aliases, interactive attribution, and surgical undo backed by attribution history tables.
- Model pricing snapshots, per-model cost breakdowns, and list-price recalculation for rows with captured pricing.
- Agent-callable `usage_query` tool for usage summaries and project/model/session rollups.
- Privacy controls for newly logged rows, JSON export, SQLite backup, and diagnostics via `/usage doctor`.
- TypeScript typecheck and Node test suite.

[Unreleased]: https://github.com/ttiimmaahh/pi-usage-bar/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ttiimmaahh/pi-usage-bar/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/ttiimmaahh/pi-usage-bar/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ttiimmaahh/pi-usage-bar/releases/tag/v0.1.0
