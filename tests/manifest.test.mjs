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

// --- Permission posture: inject on-demand thay vì <all_urls> ---

test("không còn quyền rộng: bỏ <all_urls> và content_scripts auto-inject", () => {
  assert.ok(!manifest.host_permissions, "host_permissions phải được bỏ — dùng optional_host_permissions");
  assert.ok(!manifest.content_scripts, "content_scripts auto-inject mọi trang phải được bỏ");
  assert.ok(
    !JSON.stringify(manifest).includes("<all_urls>"),
    "manifest không được chứa <all_urls> ở bất kỳ đâu"
  );
});

test("quyền tối thiểu cho inject on-demand: scripting + activeTab", () => {
  const perms = manifest.permissions || [];
  for (const p of ["storage", "tabs", "webNavigation", "alarms", "scripting", "activeTab"]) {
    assert.ok(perms.includes(p), `thiếu permission bắt buộc: ${p}`);
  }
  assert.ok(
    Array.isArray(manifest.optional_host_permissions) &&
      manifest.optional_host_permissions.includes("*://*/*"),
    "optional_host_permissions phải cho phép xin host per-domain khi user bật khóa"
  );
});

test("background inject content.js on-demand bằng chrome.scripting", () => {
  const bg = readFileSync(path.join(root, "background.js"), "utf8");
  assert.ok(
    bg.includes("chrome.scripting.executeScript"),
    "background phải inject content.js qua chrome.scripting.executeScript"
  );
  assert.ok(bg.includes("'content.js'"), "background phải tham chiếu file content.js khi inject");
});

test("content.js có guard chống double-injection", () => {
  const cs = readFileSync(path.join(root, "content.js"), "utf8");
  assert.ok(
    cs.includes("__tabLockInjected"),
    "content.js được chạy lại qua executeScript → cần guard tránh redeclare"
  );
});
