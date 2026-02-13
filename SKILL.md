# Hashline Skill

Provides `hashline_read` and `hashline_edit` tools that use the hashline binary for content-addressed line editing.

## Tools

- `hashline_read(path, filter?)` — Read a file and return lines with their contextual hashes.
- `hashline_edit(path, operation, target, new_content)` — Edit a file using hash-based addressing.

## Parameters

**hashline_edit**
- `path`: Path to the file to edit (relative or absolute)
- `operation`: `replace_line`, `replace_range`, `insert_after`, or `insert_before`
- `target`:
  - For `replace_line`, `insert_after`, `insert_before`: a single hash or a space-separated hash chain (last hash is the target line; preceding hashes provide context to disambiguate)
  - For `replace_range`: `startHash-endHash`
- `new_content`: The new text to insert or replace

**hashline_read**
- `path`: Path to the file to read
- `filter` (optional): Filter output by:
  - Single hash → returns that line only
  - Hash chain → returns the target line if the chain matches
  - Range `startHash-endHash` → returns lines from start to end inclusive

## Binary discovery

The skill searches for the `hashline` executable in the following order:

1. Environment variable `HASHLINE_BINARY` (if set)
2. `bin/` subdirectory inside the skill directory, with platform-specific name:
   - Linux amd64: `hashline_linux_amd64`
   - Linux arm64: `hashline_linux_arm64`
   - macOS amd64: `hashline_darwin_amd64`
   - macOS arm64: `hashline_darwin_arm64`
   - Windows amd64: `hashline_windows_amd64.exe`
3. `hashline` in the system `PATH`
4. Legacy paths (for backward compatibility):
   - `<workspace>/hashline/hashline_go`
   - `/home/claude/work/hashline/hashline_go`
   - `<workspace>/hashline/hashline.js`
   - `/home/claude/work/hashline/hashline.js`

## Installation

1. Ensure you have a compiled `hashline` binary for your platform. You can:
   - Download from [GitHub releases](https://github.com/Splurth/hashline-skill/releases) and place in `skills/hashline/bin/` with the appropriate name.
   - Build from source: `go build -o hasline_go hashline.go` and copy to the skill's `bin/` or set `HASHLINE_BINARY`.
2. Enable the skill in OpenClaw config: `skills.entries.hashline.enabled = true`.
3. Restart the gateway.

## Notes

- Always call `hashline_read` before `hashline_edit` to obtain current hashes; after an edit, downstream hashes change, so re-read for subsequent operations.
- Use hash chains when individual hashes collide (e.g., long runs of identical lines).
- The skill logs edit attempts to `~/.openclaw/hashline_metrics.log` if `skills.hashline.logEnabled` is set to `true` in config.
