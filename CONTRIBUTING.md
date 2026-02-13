# Contributing to Hashline

Thank you for considering contributions! This document provides guidelines for development.

## Development Setup

1. Clone the repository.
2. Install Go 1.21+.
3. Build the binary:
   ```bash
   go build -o hasline_go hashline.go
   ```
4. For testing with the OpenClaw skill, copy the binary to the skill's `bin/` directory with the appropriate platform name, e.g.:
   ```bash
   mkdir -p skills/hashline/bin
   cp hasline_go skills/hashline/bin/hashline_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m)
   ```

## Running Tests

The repo includes a simple test script `test.sh` that exercises common operations. Run:

```bash
./test.sh
```

Note: The script requires Node.js for the fallback implementation if the Go binary is missing.

## Adding New Platforms

The GitHub Actions workflow builds for:
- `linux/amd64`, `linux/arm64`
- `darwin/amd64`, `darwin/arm64`
- `windows/amd64`

To add a new platform, edit `.github/workflows/build.yml` and extend the matrix.

## Release Process

1. Ensure all changes are committed and tests pass.
2. Create a new tag following semantic versioning:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. GitHub Actions will automatically build binaries and create a draft release.
4. Edit the release notes and publish.

## Code Style

- Go: Follow standard Go formatting (`go fmt`).
- TypeScript: Use 2-space indentation, semicolons optional.
- Keep CLI arguments simple and backward-compatible.

## Questions?

Open an issue for discussion.
