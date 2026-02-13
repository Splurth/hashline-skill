#!/usr/bin/env node

// Hashline: contextual line editing with hash chains.
// Each line's hash = SHA256(previous K lines + current line)[:N]
// K = window size (default 5). N = adaptive length (linear bins).

const fs = require('fs');
const crypto = require('crypto');

const DEFAULT_WINDOW = 5;

function computeAdaptiveHashLength(numLines) {
  if (numLines <= 100) return 4;
  if (numLines <= 1000) return 5;
  if (numLines <= 10000) return 6;
  return 8;
}

function computeContextualHashes(lines, window = DEFAULT_WINDOW) {
  const numLines = lines.length;
  const hashLen = computeAdaptiveHashLength(numLines);
  const result = [];

  for (let i = 0; i < numLines; i++) {
    const start = Math.max(0, i - window);
    const contextLines = lines.slice(start, i + 1);
    const context = contextLines.join('\n');
    const h = crypto.createHash('sha256').update(context, 'utf8').digest('hex').slice(0, hashLen);
    result.push({
      hash: h,
      content: lines[i],
      index: i
    });
  }

  return { hashes: result, hashLen };
}

function findLineIndexByHashChain(hashedLines, hashChain) {
  const n = hashChain.length;
  if (n === 0) return -1;
  const targetHash = hashChain[n - 1];
  for (let i = 0; i < hashedLines.length; i++) {
    if (hashedLines[i].hash !== targetHash) continue;
    let ok = true;
    for (let j = 1; j < n; j++) {
      const ctxIdx = i - j;
      if (ctxIdx < 0 || hashedLines[ctxIdx].hash !== hashChain[n - 1 - j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function applyEdit(filePath, op, args, dryRun = false) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const { hashes, hashLen } = computeContextualHashes(lines);
  let changed = false;
  let newLines = null;

  switch (op) {
    case 'replace_line':
      if (args.length < 2) throw new Error('replace_line needs <hash-or-chain> <newContent>');
      const hashTokens = args[0].split(/\s+/).filter(Boolean);
      if (hashTokens.length === 0) throw new Error('No hash provided');
      const idx = findLineIndexByHashChain(hashes, hashTokens);
      if (idx === -1) throw new Error(`Hash chain not found: ${args[0]}`);
      const newContent = args.slice(1).join(' ');
      newLines = lines.slice();
      newLines[idx] = newContent;
      changed = true;
      break;

    case 'replace_range':
      if (args.length < 2) throw new Error('replace_range needs <startHash>-<endHash> <newContent>');
      const [startHash, endHash] = args[0].split('-');
      if (!startHash || !endHash) throw new Error('Range must be startHash-endHash');
      const startIdx = findLineIndexByHashChain(hashes, [startHash]);
      const endIdx = findLineIndexByHashChain(hashes, [endHash]);
      if (startIdx === -1) throw new Error(`Start hash ${startHash} not found`);
      if (endIdx === -1) throw new Error(`End hash ${endHash} not found`);
      if (startIdx > endIdx) throw new Error('Start must precede end');
      const newContentRange = args.slice(1).join(' ');
      const replacementLines = newContentRange.split(/\r?\n/);
      newLines = [
        ...lines.slice(0, startIdx),
        ...replacementLines,
        ...lines.slice(endIdx + 1)
      ];
      changed = true;
      break;

    case 'insert_after':
      if (args.length < 2) throw new Error('insert_after needs <hash-or-chain> <newContent>');
      const afterTokens = args[0].split(/\s+/).filter(Boolean);
      if (afterTokens.length === 0) throw new Error('No hash provided');
      const idxAfter = findLineIndexByHashChain(hashes, afterTokens);
      if (idxAfter === -1) throw new Error(`Hash chain not found: ${args[0]}`);
      const insertContent = args.slice(1).join(' ');
      const insertLines = insertContent.split(/\r?\n/);
      newLines = [
        ...lines.slice(0, idxAfter + 1),
        ...insertLines,
        ...lines.slice(idxAfter + 1)
      ];
      changed = true;
      break;

    case 'insert_before':
      if (args.length < 2) throw new Error('insert_before needs <hash-or-chain> <newContent>');
      const beforeTokens = args[0].split(/\s+/).filter(Boolean);
      if (beforeTokens.length === 0) throw new Error('No hash provided');
      const idxBefore = findLineIndexByHashChain(hashes, beforeTokens);
      if (idxBefore === -1) throw new Error(`Hash chain not found: ${args[0]}`);
      const insertContentB = args.slice(1).join(' ');
      const insertLinesB = insertContentB.split(/\r?\n/);
      newLines = [
        ...lines.slice(0, idxBefore),
        ...insertLinesB,
        ...lines.slice(idxBefore)
      ];
      changed = true;
      break;

    default:
      throw new Error(`Unknown operation: ${op}`);
  }

  if (changed && !dryRun) {
    const output = newLines.join('\n');
    fs.writeFileSync(filePath, output, 'utf8');
  }

  return { changed, hashLen };
}

function readCommand(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const { hashes, hashLen } = computeContextualHashes(lines);
  hashes.forEach(h => {
    console.log(`${h.index+1}:${h.hash}|${h.content}`);
  });
  console.log(`# window: ${DEFAULT_WINDOW} lines, hash length: ${hashLen} chars (SHA256 prefix)`);
}

function editCommand(filePath, op, args, dryRun = false) {
  try {
    const result = applyEdit(filePath, op, args, dryRun);
    if (result.changed) {
      console.log(`Edit ${op} applied. (hash length ${result.hashLen})`);
    } else {
      console.log('No change made.');
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

const [, , command, filePath, ...rest] = process.argv;

if (!command || !filePath) {
  console.error(`
Usage:
  hashline read <file>
  hashline edit <file> <operation> [args...]

Operations:
  replace_line <hash-or-chain> <newContent>
  replace_range <startHash>-<endHash> <newContent>
  insert_after <hash-or-chain> <newContent>
  insert_before <hash-or-chain> <newContent>

Options:
  --dry-run: preview without writing
`);
  process.exit(1);
}

const dryRun = rest.includes('--dry-run');
let op, args;

if (command === 'read') {
  readCommand(filePath);
} else if (command === 'edit') {
  op = rest[0];
  if (!op) {
    console.error('Missing operation');
    process.exit(1);
  }
  args = rest.slice(1);
  editCommand(filePath, op, args, dryRun);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
