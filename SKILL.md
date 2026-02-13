# Hashline Skill for OpenClaw

Provides `hashline_read` and `hashline_edit` tools that use the hashline binary for reliable, content-addressed line editing.

## Tools

| Tool | Description |
|------|-------------|
| `hashline_read(path, filter?)` | Read a file and return lines with contextual hashes. Optionally filter by a single hash, a hash chain, or a range `startHash-endHash`. |
| `hashline_edit(path, operation, target, new_content)` | Edit a file using hash-based addressing. Operations: `replace_line`, `replace_range`, `insert_after`, `insert_before`. |

## Parameters

**hashline_edit**
- `path` (string, required) — Path to the file to edit.
- `operation` (enum, required) — One of: `replace_line`, `replace_range`, `insert_after`, `insert_before`.
- `target` (string, required) —
  - For `replace_line`, `insert_after`, `insert_before`: a single hash or a space‑separated **hash chain** (last hash = target line; preceding hashes provide context).
  - For `replace_range`: `startHash-endHash`.
- `new_content` (string, required) — The new text to insert or replace.

**hashline_read**
- `path` (string, required)
- `filter` (string, optional) — Filter results by:
  - Single hash → returns that line only.
  - Hash chain → returns the target line if the chain matches.
  - Range `startHash-endHash` → returns lines from start to end inclusive.

## Setup

1. Obtain a `hashline` binary for your platform (see main README).
2. Place it in one of the locations the skill searches:
   - `skills/hashline/bin/` with platform‑specific name (preferred)
   - Anywhere in `PATH` as `hashline`
   - Set `HASHLINE_BINARY` environment variable to point to it
3. Enable the skill in OpenClaw config:
   ```json
   {
     "skills": {
       "entries": {
         "hashline": { "enabled": true }
       }
     }
   }
   ```
4. (Optional) Deny the built‑in `edit` tool to force hashline usage:
   ```json
   {
     "tools": {
       "deny": ["edit"]
     }
   }
   ```
5. Restart the gateway.

## Notes

- **Always** call `hashline_read` before `hashline_edit` to obtain fresh hashes. After an edit, downstream hashes change; re‑read for subsequent operations.
- Use **hash chains** when individual hashes are not unique (e.g., long runs of identical lines).
- The skill logs edit attempts (if `skills.hashline.logEnabled = true`) to `~/.openclaw/hashline_metrics.log` with fields: `ts`, `op`, `path`, `target`, `success`, `durationMs`, `error?`.

## Example workflow

```json
// Step 1: read the file
{
  "tool": "hashline_read",
  "params": { "path": "main.go" }
}

// Step 2: parse the response to get a line hash (e.g., "a3f2c1")
// Step 3: edit that line
{
  "tool": "hashline_edit",
  "params": {
    "path": "main.go",
    "operation": "replace_line",
    "target": "a3f2c1",
    "newContent": "    return \"Hello, world!\""
  }
}
```

For a range replace:
```json
{
  "tool": "hashline_edit",
  "params": {
    "path": "main.go",
    "operation": "replace_range",
    "target": "3a1b9c-7e2d8f",
    "newContent": "package main\n\nimport \"fmt\""
  }
}
```
