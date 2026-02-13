# Hashline

A content-addressed line editing tool using contextual hashes and hash chains. It provides a reliable edit interface for LLM coding agents by replacing textual matching with cryptographic hashes.

## Quick start (OpenClaw skill)

The `hashline` skill is published as a standalone repo and can be installed in OpenClaw. It expects a platform-specific binary in `bin/` inside the skill directory.

### Installation

1. Download the appropriate binary for your platform from the [GitHub releases page](https://github.com/Splurth/hashline-skill/releases).
2. Place it in the skill's `bin/` directory with the correct name:
   - Linux amd64: `bin/hashline_linux_amd64`
   - Linux arm64: `bin/hashline_linux_arm64`
   - macOS amd64: `bin/hashline_darwin_amd64`
   - macOS arm64: `bin/hashline_darwin_arm64`
   - Windows amd64: `bin/hashline_windows_amd64.exe`
3. Enable the skill in OpenClaw config: `skills.entries.hashline.enabled = true`
4. Restart the gateway.

The skill will automatically use the binary from `bin/` if present. You can also set the `HASHLINE_BINARY` environment variable to point to any executable.

### CLI usage (standalone)

Once the binary is in place (or if you compile from source):

```bash
# Read a file with hashes
hashline read <file>

# Edit operations
hashline edit <file> replace_line <hash-or-chain> "new content"
hashline edit <file> replace_range <startHash>-<endHash> "new content"
hashline edit <file> insert_after <hash-or-chain> "new content"
hashline edit <file> insert_before <hash-or-chain> "new content"
```

## Design

- **Contextual hashes**: Each line's hash is `SHA256(previous K lines + current line)[:N]`. This makes the hash position-sensitive; any upstream edit changes downstream hashes.
- **Stale edit detection**: If the file changed since the last read, the provided hash won't be found → the edit is rejected.
- **Hash chains**: When a hash appears multiple times, provide a space-separated chain of consecutive hashes ending at the target. The chain anchors the edit precisely without needing line numbers.
- **Adaptive hash length**: Based on file size to keep collision probability negligible while keeping hashes short.
  - ≤100 lines → 4 hex chars
  - ≤1,000 lines → 5 hex chars
  - ≤10,000 lines → 6 hex chars
  - >10,000 lines → 8 hex chars

## Building from source

```bash
go build -o hasline_go hashline.go
```

The Node.js fallback (`hashline.js`) is also included but not recommended for production due to slower startup.

## Performance

For a 100k-line file on typical hardware:
- Read: ~0.16s
- Replace line: ~0.09s
- Insert after: ~0.07s
- Replace range: ~0.10s

See `PERFORMANCE.md` for details.

## License

MIT
