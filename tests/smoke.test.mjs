import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const htmlFiles = ["index.html", "basic.html", "Memory.html", "RAG.html", "flourish_clone.html", "options.html", "popup.html"]
  .filter((f) => existsSync(path.join(root, f)));

test("có ít nhất một file HTML", () => {
  assert.ok(htmlFiles.length > 0, "không tìm thấy file HTML nào");
});

test("mọi asset local được tham chiếu trong HTML đều tồn tại", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(path.join(root, file), "utf8");
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith("data:") && !u.startsWith("/"))
      // Bỏ qua link điều hướng không có extension (vd: "story/1906749?16")
      .filter((u) => /\.[a-z0-9]+$/i.test(u.split("?")[0]));
    for (const ref of refs) {
      const p = path.join(root, decodeURIComponent(ref.split("?")[0].split("#")[0]));
      assert.ok(existsSync(p), `${file}: thiếu asset "${ref}"`);
    }
  }
});

