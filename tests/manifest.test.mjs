import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));

// Chỉ thu thập các key chắc chắn là file, bỏ qua giá trị đặc biệt
// (match pattern "<all_urls>", "type": "module", ...)
const isFileRef = (v) =>
  typeof v === "string" &&
  !v.startsWith("<") &&
  !v.includes("://") &&
  /\.(html|js|css|png|svg|json|jpg|webp|woff2?)$/.test(v);

const collectFiles = (v, out = []) => {
  if (typeof v === "string") {
    if (isFileRef(v)) out.push(v);
  } else if (Array.isArray(v)) {
    v.forEach((x) => collectFiles(x, out));
  } else if (v && typeof v === "object") {
    Object.values(v).forEach((x) => collectFiles(x, out));
  }
  return out;
};

test("manifest.json hợp lệ (name + version)", () => {
  assert.ok(manifest.name && typeof manifest.name === "string");
  assert.ok(/^\d+\.\d+/.test(String(manifest.version)), "version không đúng format");
});

test("mọi file tham chiếu trong manifest đều tồn tại", () => {
  const refs = collectFiles(manifest);
  assert.ok(refs.length > 0, "manifest không tham chiếu file nào — kiểm tra lại manifest");
  for (const ref of refs) {
    assert.ok(existsSync(path.join(root, ref)), `manifest tham chiếu file không tồn tại: ${ref}`);
  }
});
