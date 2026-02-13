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
