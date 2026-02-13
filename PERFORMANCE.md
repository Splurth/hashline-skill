# Performance Benchmarks

Tested on 100,000-line file (~1.2 MB).

| Operation | Real Time (s) | User (s) | Sys (s) |
|-----------|---------------|----------|---------|
| `read` (full file) | 0.16 | 0.12 | 0.04 |
| `replace_line` | 0.09 | 0.07 | 0.01 |
| `insert_after` | 0.07 | 0.07 | 0.02 |
| `replace_range` (6 lines) | 0.10 | 0.07 | 0.02 |

Hash length: 8 hex chars for this file size.

Notes:
- Go binary compiled with `-ldflags="-s -w"`
- Measured with `/usr/bin/time`
- Machine: Ubuntu 22.04 (arm64), 4GB RAM
