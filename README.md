# Contextual Hashline

Content-addressed line editing with **position-sensitive hashes** and **hash chains**.

## Core properties

- **No line numbers in commands** — the model references lines by hash(es).
- **Change detection** — any upstream edit changes the context for downstream lines, causing their hashes to change. Stale edit commands are rejected.
- **Hash chains for disambiguation** — if a hash appears multiple times, provide a chain of consecutive hashes (space-separated). The last hash is the target; preceding hashes must match the lines immediately before it.
- **Adaptive hash length** — 2 to N hex chars based on file size to keep collision probability negligible.
- **Deterministic** — same file content always yields same hashes.

The hash is `SHA256( context )[:N]`, where `context` = previous `K` lines (as many as available) plus the current line, joined by `\n`.  
`K` = window size (default 5).  
`N` = adaptive hash length in hex chars, chosen by file size:
- ≤100 lines → 4 chars
- ≤1,000 lines → 5 chars
- ≤10,000 lines → 6 chars
- >10,000 lines → 8 chars

This keeps hashes short while still providing >99.99% uniqueness for typical files. For massive duplicates, use hash chains.

## Usage

```bash
# Read a file to obtain hashes
node hashline.js read <file>

# Edit using a single hash (fast, works if unique)
node hashline.js edit <file> replace_line <hash> "new content"

# If the same hash appears multiple times, use a chain to pinpoint:
node hashline.js edit <file> replace_line "<hash1> <hash2> ... <targetHash>" "new content"
# The chain lists consecutive hashes ending at the target line.

# Other operations
node hashline.js edit <file> replace_range <startHash>-<endHash> "new content"
node hashline.js edit <file> insert_after <hash-or-chain> "new content"
node hashline.js edit <file> insert_before <hash-or-chain> "new content"

# Dry run
node hashline.js edit <file> replace_line <hash> "new content" --dry-run
```

Always `read` before editing to get current hashes. After an edit, re-`read` for subsequent operations.

## Example

```bash
$ node hashline.js read sample.go
1:3a|package main
2:1f|
3:d4|import "fmt"
...
7:b7|    return "Hello, World!"

# Using chain to edit line 10 (if hash 0ef7e22b appears earlier)
$ node hashline.js edit sample.go replace_line '9b4ba6b0 0ef7e22b' '    return "Hi!"'
Edit replace_line applied. (hash length 8)
```

## Why this design?

- Contextual hashes are unique across positions when the file hasn't changed.
- When identical runs cause collisions, the model can easily supply a short chain of preceding hashes to disambiguate, without needing to know exact line numbers.
- No artificial line markers in hashes; the chain provides the positional context.
- Adaptive hash length keeps tokens short for small files and safe for large ones.

## Implementations

- `hashline.js` — Node.js (tested)
- `hashline.go` — Go (structure provided; compile with `go build`)

## Safety

- Edit commands are rejected if the hash chain is not found, indicating the file changed since the last `read`.
- For `replace_range`, both end hashes must be present and in order.
- The tool does not attempt to merge conflicting edits; it aborts instead of guessing.
