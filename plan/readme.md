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
