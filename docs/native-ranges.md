# Compact Native file ranges

中文：[紧凑文件范围](紧凑文件范围.md).

A fully returned `ops_read_files` range uses one path header, exact numbered text and one revision/continuation notice per file. When all files have exactly the same absolute parent, a JSON-quoted `Base` appears once and each JSON-quoted filename is relative to it. Different parents retain absolute paths.

```text
[Base: "/workspace/src"]
=== FILE: "server.ts" (Lines 1-2 of 80) ===
1|import { createServer } from 'http';
2|const port = 8080;
[revision=cfd1bc81432fd6b88748b827f46bb4242db17cf8655cf4ea90f3ba0e62065355; more lines; nextOffset=3]
```

The characters after `N|` (or `N | ` in a single-file read) are **literal source**, including leading spaces, quotes and backslashes. Copy that body directly into a literal edit. Source that happens to look like JSON is still literal; do not decode it.

A line containing controls, DEL, NEL or Unicode line separators instead uses `Nj|"..."` / `Nj | "..."`: the trusted `j` in the line-number field marks a **complete JSON string**, including quotes. Decode that string once before editing; the edit API never auto-unescapes input. A real tab therefore appears as `1j|"\t"`, while the two source characters backslash-plus-t appear literally as `1|\t`. A one-time source-encoding notice precedes the first marked line. The marker and JSON body together are reversible; source cannot forge extra physical rows or headers. LF/CRLF accounting stays with the worker.

Grep JSON-quotes its complete path field, using `"path":Nj | "..."`, or `"path" [json] | "..."` when line numbers are absent. This prevents filenames ending in `:12j`, `[json]` or a delimiter from forging an encoding marker. Declaration kind metadata is outside the source body, e.g. `"path":Nj [function] | "..."`; it must not be copied into the edit text. Diff uses `+ Nj | "..."` / `- Nj | "..."`. Canonical/PTC values remain original text. A clipped or worker-truncated line is not safe to copy or decode as a complete source line; follow its recovery notice rather than completing JSON by guesswork.

“More lines” means the file has not been exhausted; use the stated `nextOffset`. “End of file; complete=true” means this range reached the end. The aggregate “requested ranges returned” receipt means every requested range body was returned, not that every whole file was read. Full revisions, total line counts and per-file continuation remain visible. Byte sizes and duplicate counters remain available in canonical/PTC data. Per-file revision receipts omit the repeated `Notice: ` prefix and terminal period; the aggregate `Notice` and every revision/continuation/completeness fact remain intact.

Physical clipping, missing files, unexpected coverage, stored references and other uncertain results retain the diagnostic renderer and explicit recovery notices. Final display clipping removes the successful aggregate claim and asks for the original range with a smaller limit. Deduplication recognizes `N|`, `Nj|`, `N | ` and `Nj | ` formats; only an exact prior body in current provider context permits an unchanged-reference receipt.
