import { Type } from "@sinclair/typebox";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolve } from "path";

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
      lines.push({
        num: parseInt(match[1], 10),
        hash: match[2],
        content: match[3],
      });
    }
  }
  return lines;
}

function filterLines(lines: LineHash[], filter: string): LineHash[] | null {
  if (filter.includes("-")) {
    // range startHash-endHash
    const [start, end] = filter.split("-");
    const startIdx = lines.findIndex(l => l.hash === start);
    if (startIdx === -1) return null;
    const endIdx = lines.findIndex((l, i) => i > startIdx && l.hash === end);
    if (endIdx === -1) return null;
    return lines.slice(startIdx, endIdx + 1);
  } else {
    // chain (space-separated), last is target
    const tokens = filter.trim().split(/\s+/);
    if (tokens.length === 0) return null;
    const target = tokens[tokens.length - 1];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].hash !== target) continue;
      // check preceding context
      let ok = true;
      for (let j = 1; j < tokens.length; j++) {
        const ctxIdx = i - j;
        if (ctxIdx < 0 || lines[ctxIdx].hash !== tokens[tokens.length - 1 - j]) {
          ok = false;
          break;
        }
      }
      if (ok) return [lines[i]];
    }
    return null;
  }
}

// Tool schemas
const hashlineReadSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  filter: Type.String({ description: "Optional: single hash, space-separated hash chain (last is target), or range startHash-endHash to return only matching lines." }),
});

const hashlineEditSchema = Type.Object({
  path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
  operation: Type.Union([
    Type.Literal("replace_line"),
    Type.Literal("replace_range"),
    Type.Literal("insert_after"),
    Type.Literal("insert_before"),
  ], { description: "Edit operation to perform" }),
  target: Type.String({ description: "For replace/insert: single hash or space-separated hash chain (last hash is target). For replace_range: startHash-endHash." }),
  newContent: Type.String({ description: "New text content to insert or replace with" }),
});

export default function (api) {
  api.registerTool(
    {
      name: "hashline_read",
      description: "Read a file and return lines with their contextual hashes. Use before editing to obtain current hashes.",
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
              return {
                content: [{ type: "text", text: `No matching lines for filter: ${filter}` }],
                isError: true,
              };
            }
            outputLines = result;
          }
          const text = outputLines.map(l => `${l.num}:${l.hash}|${l.content}`).join("\n") + "\n";
          return {
            content: [{ type: "text", text }],
            details: { raw: text, count: outputLines.length },
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "hashline_edit",
      description: "Edit a file using hash-based addressing (contextual hashes).",
      parameters: hashlineEditSchema,
      async execute(_id, params, signal) {
        const { path, operation, target, newContent } = params;
        const absolutePath = resolve(process.cwd(), path);
        const bin = await getHashlineBinary();
        try {
          const args = ["edit", absolutePath, operation, target, newContent];
          const { stdout } = await execFileAsync(bin, args, { signal });
          return {
            content: [{ type: "text", text: stdout }],
            details: { raw: stdout },
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },
    { optional: true }
  );
}

// Prefer Go binary, fallback to Node.js script
async function getHashlineBinary() {
  const paths = [
    // Check for Go binary in skill dir or common locations
    __dirname + "/../hashline/hashline_go",
    "/home/claude/work/hashline/hashline_go",
    // Node.js script fallback
    __dirname + "/../hashline/hashline.js",
    "/home/claude/work/hashline/hashline.js",
  ];

  for (const p of paths) {
    try {
      await execFileAsync(p, ["--help"], { timeout: 500 });
      return p;
    } catch {
      // continue
    }
  }
  throw new Error("hashline binary not found (Go or Node)");
}
