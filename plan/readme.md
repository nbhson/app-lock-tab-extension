# Plan — app-lock-tab-extension

> Chrome MV3 extension khóa tab theo domain bằng mật khẩu.

## Kết quả Review (audit đợt 1)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | CRITICAL | content.js:203 | `domain: domain` — biến `domain` không tồn tại (đúng ra là `currentDomain`) → ReferenceError khi unlock → **unlock không bao giờ hoạt động** | Dùng `currentDomain` |
| 2 | CRITICAL | background.js:182,249 | SHA-256 trần, không salt, hash nhanh → password yếu bị bẻ offline khi storage bị đọc | PBKDF2-SHA256 150k iterations + salt 16 bytes ngẫu nhiên per-domain; verify hỗ trợ format cũ (legacy SHA-256) |
| 3 | MAJOR | content.js:280-284 | `escapeHtml` (textContent trick) không escape quotes — nếu domain nội suy vào attribute sẽ breakout | Escape đủ 5 entities |
| 4 | MINOR | background.js | Timing-unsafe string compare cho hash | `timingSafeEqual` (XOR accumulate) |

## Trạng thái

- [x] Plan
- [x] Fix #1–#4
- [x] Commit + self-review

## Review Log

### Vòng 1
- Self-review: luồng VERIFY_PASSWORD giờ dùng `currentDomain` (được set từ message SHOW_LOCK). Password mới set → format `salt:hash`; mật khẩu cũ (legacy sha256) vẫn verify được để không khóa user ra khỏi tab của chính họ — migration tự động khi set lại. `node --check` pass.

---

# Round 2 (2026-10-29) — Enterprise upgrade

## Kết quả Review (audit đợt 2)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | HIGH | options.js:107,116 | `data-domain="${domain}"` + `${letter}` nội suy thẳng vào innerHTML KHÔNG escape; `escapeHtml` bản textContent-trick không escape quotes. Domain do user nhập (chỉ validate `includes('.')`, chuỗi như `a.b" onmouseover=...` đi qua) → attribute breakout = XSS trong options page | Full 5-entity escape + dựng DOM bằng createElement/setAttribute thay vì template string |
| 2 | MAJOR | popup.js | Mọi `chrome.runtime.sendMessage` không try/catch + button chỉ re-enable sau `await` → SW lỗi/treo là nút kẹt disabled vĩnh viễn + unhandled rejection | Helper `sendMsg()` + try/finally khôi phục button |
| 3 | MAJOR | content.js | `showLockout` `setInterval` không bị hủy khi overlay bị hide giữa chừng; `showError` timeout chồng nhau khi error liên tiếp | Track timer/interval ID, clear trong `hideLockOverlay` và trước khi set mới |
| 4 | MAJOR | popup.js handleUnlock | Response rate-limited (`error:'locked'`, `retryAfter`) chỉ hiện "Sai mật khẩu" — không cho user biết đang bị khóa bao lâu | Hiện thông báo lockout + countdown từ `retryAfter` |
| 5 | MINOR | options.html footer | Text "hashed with SHA-256" — lỗi thời sau khi đợt 1 nâng PBKDF2 | Cập nhật text |
| 6 | MINOR | popup.html/popup.css | Thiếu `:focus-visible` cho input, aria-live cho message đã có nhưng thiếu role cho vài button | Bổ sung focus styles + a11y |

## Feature mới (đợt 2)

1. **Auto re-lock timer**: phiên unlock tự khóa lại sau N phút (Off/15m/1h/4h/24h, mặc định Off để không làm user hiện tại bất ngờ). Background lưu `unlockedAt` timestamp khi verify thành công; `isDomainSessionLocked` kiểm tra expiry.
2. **Session-only unlock (chrome.storage.session)**: unlocked state lưu `storage.session` — tự xóa khi đóng browser (boot chứng danh không sống qua restart). Fallback `storage.local` cho context không hỗ trợ.
3. **"Lock now"**: nút khóa lại ngay trong popup (dùng message `LOCK_DOMAIN` — trước đây define nhưng không UI nào gọi).

## Trạng thái (Round 2)

- [x] Deep review + plan
- [x] Fix #1–#6
- [x] Features: auto re-lock, session unlock, lock-now
- [x] `node --check` + manifest validate + self-review

## Review Log (Round 2)

### Vòng 2 (self-review + hoàn thiện WIP interrupted session)
- WIP từ phiên bị gián đoạn (background.js/content.js/popup.js + plan) đã được review: background/content hoàn chỉnh, popup mới chỉ có helper chưa wire vào handler → hoàn thiện theo đúng plan #2/#4 + features #1–#3.
- Hoàn thành nốt: #1 (options.js — dựng list bằng createElement/setAttribute, không còn innerHTML với dữ liệu động; thêm hostname regex chặn `a.b" onmouseover=...`), #4 (popup lockout countdown từ `retryAfter`, giữ input/button disabled đến hết giờ), #5 (footer PBKDF2), #6 (focus-visible cho select/input, aria-pressed... trong popup).
- Background: handler dispatch bọc error boundary (handler throw vẫn sendResponse, caller không treo); LOCK_DOMAIN giờ inject overlay vào các tab đang mở (Lock now có tác dụng tức thì); auto re-lock dùng chrome.alarms 1-lần (permission `alarms` thêm vào manifest) để khóa tab đang mở đúng hạn, không phụ thuộc navigation.
- `node --check` pass: background.js, content.js, popup.js, options.js. Manifest JSON hợp lệ.
- Rủi ro còn lại: `chrome.storage.session` không có trên Chrome cũ → fallback `storage.local` (unlock sống qua restart trên browser cũ) — chấp nhận được, đã comment trong code. Alarm-based re-lock min delay của Chrome có thể clamp ~30s với value ngắn (nhỏ nhất 15 phút nên không ảnh hưởng).
