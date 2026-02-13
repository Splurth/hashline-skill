package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
)

const defaultWindow = 5

func computeHashLength(numLines int) int {
	switch {
	case numLines <= 100:
		return 4
	case numLines <= 1000:
		return 5
	case numLines <= 10000:
		return 6
	default:
		return 8
	}
}

func contextualHash(lines []string, idx int, window int, hashLen int) string {
	start := idx - window
	if start < 0 {
		start = 0
	}
	context := strings.Join(lines[start:idx+1], "\n")
	h := sha256.Sum256([]byte(context))
	return hex.EncodeToString(h[:])[:hashLen]
}

type lineHash struct {
	hash string
	line string
	idx  int
}

func computeAllContextualHashes(lines []string) []lineHash {
	numLines := len(lines)
	hashLen := computeHashLength(numLines)
	result := make([]lineHash, numLines)
	for i := range lines {
		h := contextualHash(lines, i, defaultWindow, hashLen)
		result[i] = lineHash{hash: h, line: lines[i], idx: i}
	}
	return result
}

func findLineIndexByHash(hashes []lineHash, targetHash string, start int) int {
	for i := start; i < len(hashes); i++ {
		if hashes[i].hash == targetHash {
			return i
		}
	}
	return -1
}

func findLineIndexByHashChain(hashes []lineHash, chain []string) int {
	n := len(chain)
	if n == 0 {
		return -1
	}
	target := chain[n-1]
	for i := 0; i < len(hashes); i++ {
		if hashes[i].hash != target {
			continue
		}
		ok := true
		for j := 1; j < n; j++ {
			ctxIdx := i - j
			if ctxIdx < 0 || hashes[ctxIdx].hash != chain[n-1-j] {
				ok = false
				break
			}
		}
		if ok {
			return i
		}
	}
	return -1
}

func applyReplaceLine(lines []string, hashes []lineHash, hashChain []string, newContent string) ([]string, error) {
	idx := findLineIndexByHashChain(hashes, hashChain)
	if idx == -1 {
		return nil, fmt.Errorf("hash chain not found")
	}
	newLines := make([]string, len(lines))
	copy(newLines, lines)
	newLines[idx] = newContent
	return newLines, nil
}

func applyReplaceRange(lines []string, hashes []lineHash, startHash, endHash, newContent string) ([]string, error) {
	startIdx := findLineIndexByHash(hashes, startHash, 0)
	if startIdx == -1 {
		return nil, fmt.Errorf("start hash %s not found", startHash)
	}
	endIdx := findLineIndexByHash(hashes, endHash, startIdx+1)
	if endIdx == -1 {
		return nil, fmt.Errorf("end hash %s not found", endHash)
	}
	if startIdx > endIdx {
		return nil, fmt.Errorf("start must precede end")
	}
	replacement := strings.Split(newContent, "\n")
	out := make([]string, 0, startIdx+len(replacement)+(len(lines)-endIdx-1))
	out = append(out, lines[:startIdx]...)
	out = append(out, replacement...)
	out = append(out, lines[endIdx+1:]...)
	return out, nil
}

func applyInsertAfter(lines []string, hashes []lineHash, hashChain []string, newContent string) ([]string, error) {
	idx := findLineIndexByHashChain(hashes, hashChain)
	if idx == -1 {
		return nil, fmt.Errorf("hash chain not found")
	}
	insert := strings.Split(newContent, "\n")
	out := make([]string, 0, len(lines)+len(insert))
	out = append(out, lines[:idx+1]...)
	out = append(out, insert...)
	out = append(out, lines[idx+1:]...)
	return out, nil
}

func applyInsertBefore(lines []string, hashes []lineHash, hashChain []string, newContent string) ([]string, error) {
	idx := findLineIndexByHashChain(hashes, hashChain)
	if idx == -1 {
		return nil, fmt.Errorf("hash chain not found")
	}
	insert := strings.Split(newContent, "\n")
	out := make([]string, 0, len(lines)+len(insert))
	out = append(out, lines[:idx]...)
	out = append(out, insert...)
	out = append(out, lines[idx:]...)
	return out, nil
}

func readCommand(filePath string) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	linesSlice := make([]string, 0, len(lines))
	linesSlice = append(linesSlice, lines...)
	hashes := computeAllContextualHashes(linesSlice)
	hashLen := 4 // default; we compute it per file but we don't have it in computeAllContextualHashes; adjust function to return hashLen too. For simplicity, we compute length using first line's hash length.
	if len(hashes) > 0 {
		hashLen = len(hashes[0].hash)
	}
	for i, h := range hashes {
		fmt.Printf("%d:%s|%s\n", i+1, h.hash, h.line)
	}
	fmt.Printf("# window: %d lines, hash length: %d chars (SHA256 prefix)\n", defaultWindow, hashLen)
}

func editCommand(filePath, op string, args []string, dryRun bool) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	linesSlice := make([]string, 0, len(lines))
	linesSlice = append(linesSlice, lines...)
	hashes := computeAllContextualHashes(linesSlice)
	hashLen := 4
	if len(hashes) > 0 {
		hashLen = len(hashes[0].hash)
	}

	var out []string
	var errEdit error

	switch op {
	case "replace_line":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "replace_line needs <hash[ ...]> <newContent>")
			os.Exit(1)
		}
		chain := strings.Fields(args[0])
		if len(chain) == 0 {
			fmt.Fprintln(os.Stderr, "no hash provided")
			os.Exit(1)
		}
		out, errEdit = applyReplaceLine(linesSlice, hashes, chain, strings.Join(args[1:], " "))
	case "replace_range":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "replace_range needs <startHash>-<endHash> <newContent>")
			os.Exit(1)
		}
		parts := strings.Split(args[0], "-")
		if len(parts) != 2 {
			fmt.Fprintln(os.Stderr, "invalid range format")
			os.Exit(1)
		}
		out, errEdit = applyReplaceRange(linesSlice, hashes, parts[0], parts[1], strings.Join(args[1:], " "))
	case "insert_after":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "insert_after needs <hash[ ...]> <newContent>")
			os.Exit(1)
		}
		chain := strings.Fields(args[0])
		if len(chain) == 0 {
			fmt.Fprintln(os.Stderr, "no hash provided")
			os.Exit(1)
		}
		out, errEdit = applyInsertAfter(linesSlice, hashes, chain, strings.Join(args[1:], " "))
	case "insert_before":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "insert_before needs <hash[ ...]> <newContent>")
			os.Exit(1)
		}
		chain := strings.Fields(args[0])
		if len(chain) == 0 {
			fmt.Fprintln(os.Stderr, "no hash provided")
			os.Exit(1)
		}
		out, errEdit = applyInsertBefore(linesSlice, hashes, chain, strings.Join(args[1:], " "))
	default:
		fmt.Fprintf(os.Stderr, "unknown operation %s\n", op)
		os.Exit(1)
	}

	if errEdit != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", errEdit)
		os.Exit(1)
	}

	if dryRun {
		fmt.Println("Dry run: changes would be applied.")
		for i, line := range out {
			fmt.Printf("%d:|%s\n", i+1, line)
		}
	} else {
		content := strings.Join(out, "\n")
		if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "write error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Edit %s applied. (hash length %d)\n", op, hashLen)
	}
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: hashline [read|edit] <file> [args...]")
		os.Exit(1)
	}
	command := os.Args[1]
	filePath := os.Args[2]
	rest := os.Args[3:]

	dryRun := false
	for _, f := range rest {
		if f == "--dry-run" {
			dryRun = true
		}
	}

	switch command {
	case "read":
		readCommand(filePath)
	case "edit":
		if len(rest) == 0 {
			fmt.Fprintln(os.Stderr, "missing operation")
			os.Exit(1)
		}
		op := rest[0]
		args := rest[1:]
		editCommand(filePath, op, args, dryRun)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %s\n", command)
		os.Exit(1)
	}
}
