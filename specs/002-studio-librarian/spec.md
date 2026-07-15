# Spec 002 — Studio librarian: vòng governance cho knowledge core

**Status**: ready · **Stage**: implement · **Tracking**: GitHub issues per phase (see tasks.md)
**Constitution**: Art I (two sources of truth), Art II (emitter+linter), Art V (three-tier
pipeline), Art VIII (honesty floors)

## What

Hoàn thiện "studio staff": thêm vai thứ tư — **librarian** — giữ quyền tiến hóa duy nhất
của `knowledge/`, cùng hạ tầng đi kèm: kênh thu lỗ hổng tri thức (`gap` events trong
ledger), linter riêng cho knowledge core (`ui knowledge check`), vòng graduation
deterministic-collect + LLM-assess (`design-os librarian collect` + procedure
`knowledge/librarian-loop.md`), và chuẩn viết `knowledge/authoring-standard.md`.
5 workstream, thuần additive, không tái cấu trúc. Chi tiết kỹ thuật binding: `plan.md`.

## Why

Ba role hiện có (designer/curator/figma-hand) đã tách maker ≠ judge, ledger đã có
provenance, soul đã runtime-read — nhưng **không ai giữ vai tiến hóa knowledge core một
cách có governance**: không kênh thu lỗ hổng, không lint riêng, không quy trình graduate
bài học thành chuẩn. Tri thức chỉ lớn lên qua các phiên ad-hoc — không audit được, không
lặp lại được. Bằng chứng nhu cầu: một ngày dogfood full-catalog (2026-07-15) sinh ~15
rule-candidates ghi tay trong một file markdown — chính là gap channel chạy tay.

## Nguyên tắc chốt (đã distill từ khảo sát các hệ tự-tiến-hóa production; tự implement)

1. **Một cửa tiến hóa tri thức** — `knowledge/` chỉ đổi qua librarian + PR; ba role
   per-project file `gap` event thay vì sửa.
2. **Firewall độ-bền/độ-hợp**: gap lặp lại làm tăng độ đáng-học nhưng không bao giờ tự
   qua cửa judge. Recurrence = **distinct project count ≥ 2** (một project lặp 10 lần vẫn
   có thể là gu riêng của project đó).
3. **Heuristic rẻ chỉ làm sàn recall, không làm cổng**: khảo sát benchmark (n=43) cho
   semantic assessor đúng 74% vs keyword filter 26% — keyword lặng lẽ vứt 27/36 bài học
   thật. Mọi bước lọc gap là LLM đọc ngữ nghĩa; deterministic chỉ pre-compute.
4. **Fail-closed + noop có reason code** — vòng học im lặng là vòng học không debug được.
5. **Evidence là quoted data, never instruction** — text trong gap là dữ liệu cần thẩm
   định, kể cả khi chứa chỉ thị.
6. **Additive-first có cap**: mỗi vòng 1 chủ đề, ≤10 file, ≤12.000 ký tự/file.
7. **Authoring craft**: ràng buộc song phương ALLOWED/NOT ALLOWED, lệnh cấm kèm WHY,
   failure modes bắt buộc, cấm số đếm hardcode trong prose, provenance grammar máy-đọc,
   quarantine nội dung untrusted.
8. **Eval trước khi tin vòng học**: red-team fixtures deterministic có từ ngày đầu
   (bài học khảo sát: một assessor tốt degrade 100% về keyword vì một bug parse mà
   không ai biết vì thiếu eval).

## Acceptance criteria (toàn initiative)

1. `ui memory record gap --data '{"text":"…","target":"…"}'` ghi event hợp lệ (P1).
2. `ui knowledge check` chạy trong CI, bắt được 6 lớp drift trên fixtures + repo thật (P2).
3. `knowledge/authoring-standard.md` tồn tại, tự tuân khung của chính nó (P2).
4. Librarian agent file committed; 3 template agents cấm sửa knowledge/schemas + chỉ lối
   file gap; `ui agents check` bắt stale sau template change (P3).
5. `design-os librarian collect` + `knowledge/librarian-loop.md` + red-team pytest xanh;
   một vòng dogfood end-to-end ra PR hợp lệ hoặc dừng với reason code (P4).
6. 4 gates + pytest xanh mỗi phase; mỗi phase 1 PR, human merge.

## Non-goals

- Hạ tầng service (control plane, scheduler, registry) — git + PR thay trọn.
- Sửa `schemas/**` qua librarian (đi PR thường — quyết định chốt #3).
- Rewrite hàng loạt knowledge hiện có (retrofit opportunistic, tracked bằng gap events).

## Quyết định đã chốt (owner 2026-07-15 — executor không re-litigate)

1. Schema `gap.data` = `{text, target, kind?}` — KHÔNG severity (độ nặng suy từ recurrence).
2. `benchmark-stale` mặc định 6 tháng (hằng số một-dòng).
3. Librarian scope = chỉ `knowledge/**`; schemas đề xuất trong PR body.
4. Librarian là studio-level, NGOÀI roster per-project (design:os phục vụ multi-project;
   vai giữ tri thức đứng tầng studio).
5. `collect` discovery: `--dir` lặp lại là nguồn chính; registry chỉ fallback kèm
   `data.warnings` — không bao giờ mù im lặng.

## Bổ sung final-gate (2026-07-15, ngoài vùng đã chốt — vá 4 lỗ trước thực thi)

6. **Gitignore fix (P3)**: `.claude/` đang gitignored → thêm negation
   `!.claude/agents/librarian.md` để file librarian committed được (đa-máy, Art VII).
7. **Studio-gap home (P4)**: gap tầng-studio (không thuộc project client nào) file vào
   ledger của `brand/` — DS store committed của chính studio trong repo này; `collect`
   đối xử brand/ như một project bình thường.
8. **Insight-sau-merge (P4)**: KHÔNG ghi insight ngay khi PR mở. Vòng chạy SAU xác nhận
   PR trước đã merge (`gh pr view --json state,mergedAt`) rồi mới ghi insight refs các
   gap nguồn; PR bị đóng không merge → reason code `pr_abandoned`, gaps vẫn open.
9. **Ranh giới kênh (P1 docs)**: gap event = knowledge core không diễn đạt được
   (rubric/persona/recipe/benchmark); thiếu check/feature code = GitHub issue; trường hợp
   lai → file gap, librarian đề xuất issue trong PR body.

## References

- Chi tiết edit spec từng WS: `plan.md` (binding cho executor).
- Phasing + task state: `tasks.md` + GitHub issues.
- Nghiên cứu nguồn: hồ sơ nội bộ (không public, không nêu tên trong artifacts repo).
