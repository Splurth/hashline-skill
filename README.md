# Hashline

[![GitHub release](https://img.shields.io/github/v/release/splurth/hashline-skill)](https://github.com/Splurth/hashline-skill/releases)

A content-addressed line editing tool for LLM coding agents. Instead of asking the model to reproduce exact text, each line is tagged with a short cryptographic hash. The model edits by referencing these hashes, making edits robust to whitespace changes and file mutations.

**Key benefits:**
- **No more string matching failures** — hashes uniquely identify lines, so no "old text not found" errors.
- **Stale state protection** — if the file changed since the last read, the edit is rejected.
- **Disambiguation via chains** — even if hashes collide, a short chain of preceding hashes pins the exact location.
- **Fast** — sub‑second for 100k‑line files.
- **Portable** — single compiled Go binary; no runtime.

## Quick start (as an OpenClaw skill)

1. **Install the skill** in your OpenClaw agent:
   ```bash
   openclaw plugins install https://github.com/Splurth/hashline-skill
   ```
   Or manually copy the `skills/hashline/` folder into your workspace.

2. **Get a binary** for your platform:
   - Download from [the releases page](https://github.com/Splurth/hashline-skill/releases).
   - Or build from source (requires Go 1.21+):
     ```bash
     go build -o hasline_go hashline.go
     ```
   - Place the binary in `skills/hashline/bin/` with the correct name:
     - Linux amd64: `hashline_linux_amd64`
     - Linux arm64: `hashline_linux_arm64`
     - macOS amd64: `hashline_darwin_amd64`
     - macOS arm64: `hashline_darwin_arm64`
     - Windows amd64: `hashline_windows_amd64.exe`

3. **Enable the skill** in your OpenClaw config (`openclaw.json`):
   ```json
   {
     "skills": {
       "entries": {
         "hashline": { "enabled": true }
       }
     },
     "tools": {
       "deny": ["edit"]
     }
   }
   ```
   This enables the `hashline_read` and `hashline_edit` tools and (optionally) denies the built-in `edit` to force hashline usage.

4. **Restart the gateway**:
   ```bash
   openclaw gateway restart
   ```

5. **Use it**: In your agent workflows, call `hashline_read` first to obtain hashes, then `hashline_edit` with those hashes.

## How it works

### Contextual hashes
For each line, the hash is computed as:
```
hash = SHA256(previous K lines + current line)[:N]
```
where `K = 5` (window size) and `N` is an adaptive length based on total file size:
- ≤ 100 lines → 4 hex chars
- ≤ 1,000 lines → 5 hex chars
- ≤ 10,000 lines → 6 hex chars
- > 10,000 lines → 8 hex chars

This makes the hash **position‑sensitive**:
- Changing any upstream line changes the context for downstream lines, thus their hashes change.
- Stale edit attempts (using old hashes) are automatically rejected.

### Hash chains for disambiguation
If a hash appears multiple times (e.g., many blank lines or repeated statements), you can provide a **chain** of consecutive hashes ending at the target. Example:
```
replace_line "aa11bb22 cc33dd44" "new content"
```
The last hash (`cc33dd44`) is the target line; the preceding hash (`aa11bb22`) must match the line immediately before it. This pins the exact occurrence without needing to know line numbers.

### Operations
- `replace_line` — replace a single line
- `replace_range` — replace a contiguous block (specify `startHash-endHash`)
- `insert_after` / `insert_before` — insert relative to a target line

## CLI usage (standalone)

If you just want the binary:

```bash
# Read a file (shows lines with hashes)
hashline read myfile.go

# Edit using a single hash
hashline edit myfile.go replace_line abc123 "new content"

# Edit using a chain to disambiguate
hashline edit myfile.go replace_line "def456 abc123" "new content"

# Replace a range
hashline edit myfile.go replace_range "111111-222222" "replacement text"

# Insert after a line
hashline edit myfile.go insert_after abc123 "new line"

# Insert before a line
hashline edit myfile.go insert_before abc123 "new line"
```

**Important:** Always `read` first to obtain fresh hashes. After an edit, re‑`read` because downstream hashes have changed.

## Performance

On typical hardware (ARM64, 2–3 GHz):
- 100k lines: read ~0.16 s, edit ~0.09 s
- See `PERFORMANCE.md` for detailed numbers.

## Configuration (skill)

| Config key | Type | Default | Description |
|------------|------|---------|-------------|
| `skills.hashline.logEnabled` | boolean | `false` | If `true`, logs edit attempts to `~/.openclaw/hashline_metrics.log`. |
| `skills.hashline.logPath` | string | `~/.openclaw/hashline_metrics.log` | Override the log file path. |
| `HASHLINE_BINARY` (env) | string | – | Path to a custom `hashline` executable to bypass discovery. |

The binary is discovered in this order:
1. `HASHLINE_BINARY` environment variable.
2. `skills/hashline/bin/` with platform‑specific name (`hashline_linux_arm64`, etc.).
3. `hashline` in `PATH`.
4. Legacy paths (`<workspace>/hashline/hashline_go`, etc.) for backward compatibility.

## Node.js fallback

The repository includes a pure‑JavaScript implementation (`hashline.js`) plus `package.json`. This is primarily for development and environments without Go. It is **not** distributed in releases — if you need it, copy the files directly from the source repository.

## Testing

Run the included test script:
```bash
chmod +x test.sh
./test.sh
```

This exercises basic operations, stale hash rejection, range replace, insertion, and chain disambiguation on duplicate lines.

## License

MIT
