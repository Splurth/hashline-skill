# Hashline

A content-addressed line editing tool using contextual hashes and hash chains.

## Tools

- `hashline_read(path, filter?)` — read a file and return lines with their hashes. Optional `filter` can be:
   - single hash (returns that line)
   - space-separated hash chain (returns the target line if chain matches)
   - range `startHash-endHash` (returns lines from start to end inclusive)
- `hashline_edit(path, operation, target, new_content)` — edit a file using hash-based addressing

## Parameters

For `hashline_edit`:
- `path`: file to edit
- `operation`: one of `replace_line`, `replace_range`, `insert_after`, `insert_before`
- `target`: for `replace/insert`: a single hash or space-separated hash chain (last hash is target). For `replace_range`: `startHash-endHash`
- `new_content`: the new text to insert or replace with

The tool executes the hashline binary (Go preferred, Node.js fallback) and returns the result.

## Setup

The skill looks for the hashline binary in:

- `<workspace>/hashline/hasline_go` (Go, preferred)
- `/home/claude/work/hashline/hasline_go`
- `<workspace>/hashline/hashline.js` (Node.js fallback)
- `/home/claude/work/hashline/hashline.js`

Build the Go binary: `go build -o hasline_go hashline.go` inside the hashline directory. If Go is not available, the Node.js script works as-is.

## Notes

- Always call `hashline_read` before editing to obtain current hashes.
- After an edit, re-read to update hashes for subsequent operations.
- Hash chains disambiguate identical lines: provide preceding context hashes before the target hash.
- Hashes are contextual (previous K lines + current line) and adaptively sized.
