import { Type } from "@sinclair/typebox";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolve, appendFileSync } from "fs";
import { join, dirname } from "path";

const execFileAsync = promisify(execFile);

interface LineHash {
  num: number;
  hash: string;
  content: string;
}

function parseHashOutput(stdout: string): LineHash[] {
  const lines: LineHash[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const match = line.match(/^(\d+):([0-9a-f]+)\|(.*)$/);
    if (match) {
      lines.push({ num: parseInt(match[1], 10), hash: match[2], content: match[3] });
    }
  }
  return lines;
}

function filterLines(lines: LineHash[], filter: string): LineHash[] | null {
  if (filter.includes("-")) {
    const [start, end] = filter.split("-");
    const startIdx = lines.findIndex(l => l.hash === start);
    if (startIdx === -1) return null;
    const endIdx = lines.findIndex((l, i) => i > startIdx && l.hash === end);
    if (endIdx === -1) return null;
    return lines.slice(startIdx, endIdx + 1);
  } else {
    const tokens = filter.trim().split(/\s+/);
    if (tokens.length === 0) return null;
    const target = tokens[tokens.length - 1];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].hash !== target) continue;
      let ok = true;
      for (let j = 1; j < tokens.length; j++) {
        const ctxIdx = i - j;
        if (ctxIdx < 0 || lines[ctxIdx].hash !== tokens[tokens.length - 1 - j]) {
          ok = false; break;
        }
      }
      if (ok) return [lines[i]];
    }
    return null;
  }
}

// Schemas
const hashlineReadSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  filter: Type.String({ description: "Optional filter: single hash, hash chain, or range startHash-endHash." }),
});

const hashlineEditSchema = Type.Object({
  path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
  operation: Type.Union([
    Type.Literal("replace_line"),
    Type.Literal("replace_range"),
    Type.Literal("insert_after"),
    Type.Literal("insert_before"),
  ], { description: "Edit operation" }),
  target: Type.String({ description: "For replace/insert: single hash or hash chain (last is target); for replace_range: startHash-endHash." }),
  newContent: Type.String({ description: "New text to insert/replace" }),
});

function getPlatformBinaryName(): string {
  const platform = process.platform; // linux, darwin, win32
  const arch = process.arch; // x64, arm64, etc.
  const goarch = arch === 'x64' ? 'amd64' : arch;
  const goos = platform === 'win32' ? 'windows' : platform;
  const ext = goos === 'windows' ? '.exe' : '';
  return `hashline_${goos}_${goarch}${ext}`;
}

async function getHashlineBinary(): Promise<string> {
  // 1. Environment variable override
  if (process.env.HASHLINE_BINARY) {
    try {
      await execFileAsync(process.env.HASHLINE_BINARY, ["--help"], { timeout: 500 });
      return process.env.HASHLINE_BINARY;
    } catch {}
  }

  // 2. Check skill directory (for distributed binaries)
  const skillDir = dirname(require.main.filename || __filename);
  const bundledBinary = join(skillDir, "bin", getPlatformBinaryName());
  try {
    await execFileAsync(bundledBinary, ["--help"], { timeout: 500 });
    return bundledBinary;
  } catch {}

  // 3. Check if hashline is in PATH
  try {
    await execFileAsync("hashline", ["--help"], { timeout: 500 });
    return "hashline";
  } catch {}

  // 4. Check legacy workspace paths (backward compatibility)
  const legacyPaths = [
    join(skillDir, "../hashline/hashline_go"),
    join(process.env.HOME || "/home/claude", "work/hashline/hashline_go"),
    join(skillDir, "../hashline/hashline.js"),
    join(process.env.HOME || "/home/claude", "work/hashline/hashline.js"),
  ];
  for (const p of legacyPaths) {
    try {
      await execFileAsync(p, ["--help"], { timeout: 500 });
      return p;
    } catch {}
  }

  throw new Error("hashline binary not found. Set HASHLINE_BINARY, place binary in skill's bin/ directory, or install hashline in PATH.");
}

export default function (api) {
  const skillConfig = api.config?.skills?.hashline || {};
  const logEnabled = skillConfig.logEnabled === true;
  const defaultLogPath = `${process.env.HOME}/.openclaw/hashline_metrics.log`;
  const logPath = skillConfig.logPath || defaultLogPath;

  function logMetric(record: { ts: string; op: string; path: string; target: string; success: boolean; durationMs: number; error?: string }) {
    if (!logEnabled) return;
    try {
      appendFileSync(logPath, JSON.stringify(record) + "\n", { encoding: 'utf8', flag: 'a' });
    } catch {}
  }

  api.registerTool({
    name: "hashline_read",
    description: "Read file with contextual hashes; optionally filter.",
    parameters: hashlineReadSchema,
    async execute(_id, params, signal) {
      const { path, filter } = params;
      const absolutePath = resolve(process.cwd(), path);
      const bin = await getHashlineBinary();
      try {
        const { stdout } = await execFileAsync(bin, ["read", absolutePath], { signal });
        const lines = parseHashOutput(stdout);
        let outputLines = lines;
        if (filter) {
          const result = filterLines(lines, filter);
          if (!result) {
            return { content: [{ type: "text", text: `No matching lines for filter: ${filter}` }], isError: true };
          }
          outputLines = result;
        }
        const text = outputLines.map(l => `${l.num}:${l.hash}|${l.content}`).join("\n") + "\n";
        return { content: [{ type: "text", text }], details: { raw: text, count: outputLines.length } };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  }, { optional: true });

  api.registerTool({
    name: "hashline_edit",
    description: "Edit a file using hash-based addressing.",
    parameters: hashlineEditSchema,
    async execute(_id, params, signal) {
      const { path, operation, target, newContent } = params;
      const absolutePath = resolve(process.cwd(), path);
      const bin = await getHashlineBinary();
      const start = Date.now();
      try {
        const args = ["edit", absolutePath, operation, target, newContent];
        const { stdout } = await execFileAsync(bin, args, { signal });
        const durationMs = Date.now() - start;
        if (logEnabled) {
          logMetric({
            ts: new Date().toISOString(),
            op: operation,
            path: absolutePath,
            target: typeof target === 'string' ? target : JSON.stringify(target),
            success: true,
            durationMs,
          });
        }
        return { content: [{ type: "text", text: stdout }], details: { raw: stdout, durationMs } };
      } catch (err: any) {
        const durationMs = Date.now() - start;
        const errorMsg = err.message || String(err);
        if (logEnabled) {
          logMetric({
            ts: new Date().toISOString(),
            op: operation,
            path: absolutePath,
            target: typeof target === 'string' ? target : JSON.stringify(target),
            success: false,
            durationMs,
            error: errorMsg,
          });
        }
        return { content: [{ type: "text", text: `Error: ${errorMsg}` }], isError: true, details: { durationMs, error: errorMsg } };
      }
    },
  }, { optional: true });
}
