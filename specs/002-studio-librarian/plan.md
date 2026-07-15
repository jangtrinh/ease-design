# Plan 002 — Studio librarian: edit specs binding cho executor

> Executor: Opus 4.8, thực hiện ĐÚNG spec; buộc lệch cơ học (dòng số trôi, tên file khác)
> được điều chỉnh tương đương; lệch THIẾT KẾ → dừng, báo cáo. Sub-task cơ học (fixtures,
> goldens, docs row, help text) delegate Sonnet 5, verify trước khi nhận.
> Đọc trước: `.specify/memory/constitution.md` + `plans/ease-design/brainstorm.md` §6 +
> `spec.md` cạnh file này (nguyên tắc + 9 quyết định chốt). Xung đột → dừng, báo cáo.

## Ràng buộc toàn cục

1. `ui` binary deterministic: pure transforms, không network, không LLM. Check phụ thuộc
   thời gian nhận mốc qua flag (`--as-of`, WS-C).
2. Không duplicate nội dung `knowledge/` vào code.
3. Code file < 200 dòng, kebab-case. Command mới theo module shape hiện hành
   `{ name, summary, hasSubcommands, run, help }`, đăng ký `COMMANDS` trong `src/cli.ts`
   (vùng đăng ký ~dòng 66–95), khai báo signature trong `src/core/command-signatures.ts`.
4. 4 gates: `npm run typecheck && npm run lint && npm run build && npm test`;
   design-os: `uv run pytest -q`. Test đụng global scope PHẢI set `EASE_DESIGN_HOME` tmp.
5. Test `ui` tại `tests/` pattern `cmd-<command>.test.ts` / `<core-module>.test.ts` (Vitest).
6. design-os envelope contract giữ nguyên (`ok_env`/`err_env`/`emit`; exit 0 clean · 1
   findings/tool-error · 2 usage; plain print; typer pinned).
7. Git: branch mới per phase, conventional commit, PR — KHÔNG merge (human gate).

---

## WS-A — Event type `gap` trong ledger (P1)

Mục tiêu: kênh thu lỗ hổng tri thức, dùng được từ hôm merge.

**A1. `src/core/memory-events.ts`**
- `EVENT_TYPES` (closed set 11 loại, ~dòng 19–31): thêm `"gap"` → 12. Giữ `v: 1`.
- `REQUIRED_DATA` (~dòng 35–47): thêm `gap: ["text", "target"]`.
  - `data.text` — mô tả lỗ hổng; `data.target` — đích dạng `<file>[#<mục>]`
    (vd `taste-rubric.md#motion`, `personas`, `benchmarks/<slug>`);
  - `data.kind` optional, không enforce: `rubric-gap | persona-gap | recipe-gap |
    benchmark-stale | guardrail-lesson`.
- `refs` với gap: OPTIONAL (khác `insight`; khuyến khích refs tới `taste_verdict`/
  `duel_result` liên quan).
- Không đổi `serializeEvent`, không đổi `nextEventId`.

**A2. `src/commands/memory-record-impl.ts`** — `runRecord` (~dòng 37–112): không đổi flag;
cập nhật help text danh sách types + 1 dòng mẫu `--data '{"text":"...","target":"..."}'`.

**A3. Docs** — file docs ledger đang liệt kê 11 event types (executor xác định — thường
`knowledge/recall-mind.md`): thêm `gap` + WHY: *"gap là nguyên liệu của vòng librarian —
designer/curator không sửa knowledge/, họ file gap."* Thêm đoạn ranh giới kênh (quyết định
chốt #9): gap = knowledge core thiếu; GitHub issue = code/check thiếu; lai → gap + đề xuất
issue trong PR body.

**Tests (Vitest)** — mở rộng test core memory-events hiện có (glob `tests/memory*.test.ts`):
`records a gap event with text+target` (happy) · `rejects gap missing target`
(`MemoryEventError` code `BAD_EVENT`) · `gap does not require refs`. Mở rộng cmd test của
memory: record gap qua CLI với `--data`, envelope trả `{ id, type: "gap" }`.

**Acceptance**: lệnh record gap chạy thật, `eventCount` tăng, graph recompile; 4 gates xanh.

---

## WS-C — `ui knowledge check` (P2, trước WS-E vài giờ)

Mục tiêu: tier "unit" cho knowledge core — free, mỗi commit, không LLM. Nhân pattern
emitter/linter sẵn có.

**C1. `src/commands/knowledge.ts`** (mới) — `hasSubcommands: true`, subcommand `check`.
Flags: `--dir <repo-root>` (default cwd), `--as-of <YYYYMM>` (bắt buộc cho staleness khi
test; default = tháng hiện tại — điểm phi-deterministic DUY NHẤT, cô lập sau flag),
`--json`. Logic thuần trong `src/core/knowledge-lint.ts` (fs-free — nhận input đã đọc,
trả findings; mỗi file < 200 dòng).

**C2. Checks** (findings model giống `agents check`: `error` → exit 1, `warning` → exit 0):

| id | severity | Luật |
|----|----------|------|
| `index-missing-row` | error | `knowledge/**/*.md` (trừ README.md) không có row trong bảng `## The files` của `knowledge/README.md` |
| `index-dead-row` | error | Row trỏ file không tồn tại |
| `persona-drift` | error | `persona-index.md` ↔ `personas/*.md` + `personas.json` lệch (đọc format thật trước khi viết parser) |
| `broken-xref` | error | Link markdown tương đối giữa file knowledge không resolve |
| `benchmark-stale` | warning | `knowledge/benchmarks/*--<YYYYMM>.dna.json` tuổi > 6 tháng so `--as-of` |
| `provenance-bad-grammar` | error | Marker `<!-- ease:source ... -->` (grammar WS-E) thiếu `ref=` hoặc `ref` trỏ file không tồn tại |

**C3.** Đăng ký `knowledgeCommand` vào `COMMANDS`. **C4.** Signature `knowledge check`
(3 flags) trong command-signatures. **C5.** CI: nối `ui knowledge check` sau `npm test`
trong chuỗi verify hiện hành (executor tìm workflow/Makefile).

**Tests** — `tests/cmd-knowledge.test.ts` + `tests/knowledge-lint.test.ts`, fixture tmp:
passes-on-consistent · index-missing-row · index-dead-row · broken-xref ·
benchmark-stale với `--as-of` (warning, exit 0) · provenance-bad-grammar ·
unknown-flag (`UNKNOWN_FLAG`).

**Acceptance**: chạy repo thật exit 0 hoặc chỉ warnings — mọi finding error thật sửa
trong cùng PR (dogfood); CI có gate mới, xanh.

---

## WS-E — `knowledge/authoring-standard.md` (P2, sau WS-C)

Mục tiêu: đóng gói authoring craft thành khung lặp lại. File là meta-knowledge — tự tuân
khung của nó.

**E1.** Nội dung bắt buộc theo thứ tự:
1. Purpose (1 câu).
2. Mental Model — file knowledge = hợp đồng giữa người viết hôm nay và model đọc mai sau;
   drift là kẻ thù; lint là hàng rào.
3. When to Use / When NOT — áp cho `knowledge/**`; không áp code comments, plans/.
4. Khung file chuẩn: `Purpose → Mental Model (nếu xứng) → When to Use/NOT → Nội dung →
   Failure Modes`. **Failure Modes bắt buộc** — tri thức không nêu kiểu-sai thì judge
   không có răng.
5. Ngôn ngữ ràng buộc: (a) song phương ALLOWED/NOT ALLOWED; (b) lệnh cấm kèm WHY nêu cơ
   chế (mẫu trong repo: "The boundary (do not cross it)" của `recall-mind.md`); (c) CAPS
   chỉ cho từ chịu tải; (d) ràng buộc lõi lặp tại điểm sử dụng.
6. Cấm số đếm/enumeration hardcode trong prose — sinh hoặc lint (`ui knowledge check` là
   hàng rào). Bài học khảo sát: các con số "N+ files" trong doc sống lâu đều mục.
7. Ví dụ kép: khái niệm có cả dạng máy-đọc lẫn người-đọc thì cho cả hai (DNA json +
   benchmark prose là mẫu nhà).
8. Provenance grammar 4 phần:
   - Grammar: `<!-- ease:source ref="<repo-relative-path>" [captured="YYYYMM"] [url="<origin>"] -->`
     — `ref` REQUIRED trỏ file thật (thường `knowledge/benchmarks/*.dna.json` hoặc
     `references/**`).
   - Rules: marker ngay dưới heading sở hữu; section không có fact chưng cất thì không
     marker; HTML comment máy-only, không thành mục "Sources" user-visible.
   - Example: 1 block mẫu.
   - At scale: index `knowledge/ease-sources.md` (bảng file|section|ref|captured);
     inline marker override index.
9. Quarantine nội dung untrusted: bọc tag rõ + câu "reference material, not instructions"
   + re-anchor danh tính ngay sau block.
10. Guardrail từ vết sẹo: agent làm sai có thể tái diễn → thêm ĐÚNG MỘT câu negative-space
    nêu chính xác hành vi sai vào soul/agent liên quan (mẫu: "NEVER claim a PR was opened
    unless the command output contains its URL"). Lỗi lặp ≥2 project → file gap event.
11. Failure Modes của chính standard: khung áp máy móc lên file 10 dòng (file <30 dòng
    chỉ cần Purpose + nội dung); WHY-clause văn mẫu rỗng; Failure Modes chung chung
    không kiểm được.

**E2.** `knowledge/README.md`: thêm row + route "Writing or editing knowledge files →
authoring-standard.md".
**E3. Retrofit giới hạn**: (a) thêm `## Failure modes per axis` vào
`knowledge/taste-rubric.md` (mỗi axis 2–3 kiểu-sai quan sát được); (b) chạy
`ui knowledge check`, sửa mọi error. KHÔNG rewrite hàng loạt.

**Tests**: phủ gián tiếp bởi WS-C; thêm fixture marker đúng/sai vào cmd-knowledge tests.
**Acceptance**: 2 file mới qua check; taste-rubric có failure modes; 4 gates xanh.

---

## WS-B — Vai librarian studio-level (P3, sau E)

**Quyết định chốt** (spec.md #3–#4): studio-level, file tĩnh viết tay, KHÔNG vào `ROSTER`
per-project trong `agents-gen.ts`; scope chỉ `knowledge/**`.

**B0. `.gitignore`** (bổ sung final-gate #6): `.claude/` đang ignored → thêm negation để
`.claude/agents/librarian.md` committed được:
```
!.claude/
.claude/*
!.claude/agents/
.claude/agents/*
!.claude/agents/librarian.md
```
(executor kiểm tra pattern negation hoạt động với `git check-ignore -v`; giữ mọi thứ khác
trong `.claude/` vẫn ignored).

**B1. `.claude/agents/librarian.md`** (mới, viết theo authoring-standard):
- Frontmatter `name: librarian`, `description:` 1 câu.
- Identity 1 đoạn + ràng buộc song phương:
  - ALLOWED: đọc mọi thứ; sửa `knowledge/**`; chạy `design-os librarian collect`,
    `ui knowledge check`; mở branch + PR.
  - NOT ALLOWED (mỗi lệnh kèm WHY): generate artifact/UI (maker ≠ keeper); chấm điểm
    artifact (đó là curator); sửa `schemas/**` (contract máy-đọc — sửa sai gãy CLI +
    mọi DS manifest; schema đi PR thường, librarian đề xuất trong PR body); sửa `src/**`,
    `design-os/**`, `templates/**` (tri thức và engine tách nguồn sự thật); merge PR của
    chính mình (human gate bất biến).
- Standing first action: `design-os librarian collect --json` rồi đọc + làm đúng
  `knowledge/librarian-loop.md`.
- Anti-hallucination guards (mỗi câu chặn 1 hành vi sai): "NEVER claim a PR was opened
  unless the `gh pr create` output contains its URL"; "When unsure a gap is durable,
  defer it — do not graduate"; "At most ONE graduation topic per run."

**B2. `knowledge/design-agents.md`**: thêm `## §<next> Librarian — the studio knowledge
keeper` (định nghĩa vai, studio-level, một cửa sửa knowledge, trỏ librarian-loop.md);
trong section 3 role: thêm cho CẢ BA câu ranh giới đúng văn phong song phương hiện có:
"…and never edits `knowledge/` or `schemas/` — a knowledge gap is recorded as a `gap`
event (`ui memory record gap`), for the librarian to graduate."; cập nhật câu "roster
registry grows…": roster per-project đóng ở 3; librarian studio-level ngoài roster.

**B3. `templates/agents/{designer,curator,figma-hand}.md`**: mỗi file 2–3 dòng cấm sửa
knowledge/schemas + chỉ lối `ui memory record gap --data '{"text":"…","target":"…"}'`.
Hệ quả templateHash đổi → mọi project cũ báo `agent-stale` — hành vi ĐÚNG; PR body ghi
migration: "chạy `ui agents init --force` tại mỗi project sau upgrade."

**B4. `knowledge/README.md`**: row cho `librarian-loop.md` (WS-D) + `authoring-standard.md`.

**Tests**: `tests/agents-gen.test.ts` cập nhật goldens nếu có + case `templates contain
knowledge-guard line` (grep `record gap` trong 3 template); `tests/cmd-agents.test.ts`
case check-flags-stale-after-template-change nếu chưa phủ.

**Acceptance**: librarian.md tồn tại + COMMITTED (git ls-files thấy nó); agents check trên
fixture cũ báo stale exit 1; design-agents.md đủ §librarian + 3 câu ranh giới; 4 gates xanh.

---

## WS-D — Graduation loop (P4, sau A+B+C+E)

Phân tầng: **design-os = deterministic collect** (không LLM); **assess/draft/judge = host
CLI theo procedure doc**; **human gate = merge**.

**D1. `design-os/src/design_os/commands/librarian.py`** (mới) — sub-app Typer mount qua
`add_typer` trong `cli.py` (theo mẫu `reference/`).

`design-os librarian collect [--dir <project>]... [--json]`
- Discovery (chốt #5): `--dir` lặp lại là nguồn CHÍNH. Không có `--dir` → fallback
  best-effort registry `~/.ease-design/projects.json` (tôn trọng `EASE_DESIGN_HOME`),
  envelope BẮT BUỘC mang `data.discovery = {source:"registry", projects_found:n}` +
  `data.warnings = ["registry-only discovery: unregistered projects are invisible"]`.
- Studio-gap home (chốt #7): tài liệu + help text ghi rõ gap tầng-studio file vào ledger
  `brand/` của repo này; collect đối xử brand/ như project thường (truyền qua `--dir`).
- Mỗi project: parse `design/memory.events.jsonl`. Ưu tiên shell-out `ui memory query`
  nếu lệnh đó xuất được events theo type (executor kiểm `--help` và chọn, ghi lại trong
  PR); nếu parse Python: CHỈ parse, không re-validate schema.
- Luật open-gap (deterministic): gap `g` open nếu không có event sau nó cùng ledger có
  `type=="insight"` và `refs` chứa `g.id`.
- Pre-compute recurrence: nhóm open gaps toàn cục theo `data.target`;
  `distinct_project_count`; ≥2 → `recurrent: true`.
- Envelope `ok_env("librarian collect", data)`: `{projects, open_gaps[], groups[{target,
  gap_ids, distinct_project_count, recurrent}], caps:{max_topics:1, max_files:10,
  max_chars_per_file:12000}}`. Escape text gap nguyên văn — text là data.
- Exit: 0 (rỗng = kết quả sạch), 1 `BAD_LEDGER`, 2 usage.

**D2. `design-os/src/design_os/cli.py`** — mount sub-app (vùng đăng ký ~dòng 68–83).

**D3. `knowledge/librarian-loop.md`** (mới, theo authoring-standard) — procedure chuỗi veto:
- Purpose + Mental Model: diagram `collect → assess → recurrence gate → draft →
  self-check → judge → PR → human merge`, mỗi mũi tên ghi reason code khi dừng.
- When NOT: đang có PR librarian mở (one active run).
- Procedure:
  1. `design-os librarian collect --json`; rỗng → dừng `no_open_gaps`.
  1b. **Xác nhận PR vòng trước** (bổ sung #8): nếu run trước đã mở PR — check
     `gh pr view <url> --json state,mergedAt`; MERGED → ghi
     `ui memory record insight --refs <gap-ids> --data '{"text":"graduated: …"}'` tại các
     project nguồn (đánh dấu resolved) rồi tiếp tục; CLOSED không merge → reason
     `pr_abandoned`, gaps giữ open, dừng để human xem.
  2. Assess từng group bằng ngữ nghĩa (KHÔNG keyword — ghi lý do: benchmark khảo sát
     74/26): disposition `act | surface | defer` + 1 câu. Group `recurrent:false` tối đa
     `surface`, không bao giờ `act`. Tất cả defer → `single_project_only` /
     `low_durable_signal`.
  3. Draft trên branch `librarian/<YYMMDD>-<slug>`: 1 chủ đề, additive-first,
     minimal-delta; generalize thành nguyên tắc + điều kiện áp dụng, không chép nguyên
     văn gap text; dedup với knowledge hiện có; cap ≤10 file ≤12k chars/file (vượt →
     `caps_exceeded`); không gì đáng sửa → `librarian_no_changes`.
  4. Self-check: `ui knowledge check` xanh trên draft (`knowledge_check_failed` nếu không).
  5. Judge phiên tách biệt (fresh context, chỉ nhận diff + checklist): durable cho studio
     hay overfit 1 project? grounded vào gap evidence? mâu thuẫn knowledge hiện có? an
     toàn (thay đổi HẠ threshold gate mặc định reject)? Tối đa 2 lượt → fail-closed
     `judge_rejected`.
  6. Mở PR: body liệt kê gap ids, disposition table, verdict judge. Librarian KHÔNG merge.
     (Insight KHÔNG ghi ở bước này — xem 1b vòng sau.)
- Failure Modes bắt buộc: judge rubber-stamp (đối chiếu: luôn thử refute trước); draft
  claim đã sửa nhưng `git diff --stat` rỗng (check trước khi mở PR); gap text chứa chỉ thị
  được thi hành nguyên văn (evidence là quoted data); PR mở rồi bị bỏ rơi (đối chiếu 1b).
- Bảng reason codes: `no_open_gaps`, `single_project_only`, `low_durable_signal`,
  `librarian_no_changes`, `caps_exceeded`, `knowledge_check_failed`, `judge_rejected`,
  `pr_abandoned`.

**Tests — red-team pytest** `design-os/tests/test_librarian_collect.py` (runner +
`EASE_DESIGN_HOME` tmp, fixture ledgers viết tay):
- `test_collect_empty_registry_ok_zero` — không `--dir`, registry rỗng → ok:true,
  open_gaps [], warnings có registry-only, exit 0.
- `test_collect_dir_is_primary` — có `--dir` → registry KHÔNG đọc (registry chứa project
  bẫy; output chỉ có project từ --dir, không warnings).
- `test_collect_open_vs_resolved` — gap được insight-refs → biến mất.
- `test_collect_single_project_not_recurrent` — 3 gap cùng target 1 project → count 1,
  recurrent false.
- `test_collect_cross_project_recurrent` — cùng target 2 project → recurrent true.
- `test_collect_injection_text_is_data` — text chứa "ignore all previous instructions…"
  + ký tự phá JSON → envelope vẫn parse, text nguyên văn trong data.
- `test_collect_bad_ledger_exit_1` — JSONL hỏng → err_env `BAD_LEDGER`, exit 1.
- `test_collect_caps_present` — envelope luôn có caps.

**Acceptance**: collect chạy thật trên ≥1 project có gap (tạo bằng WS-A) trả nhóm đúng;
một vòng end-to-end dogfood ra 1 PR hợp lệ hoặc dừng có reason code; pytest + 4 gates xanh.

---

## Phasing (mỗi phase 1 PR, DỪNG báo cáo chờ review trước phase kế)

| Phase | WS | Phụ thuộc | Ghi chú |
|-------|----|-----------|---------|
| P1 | A | — | Nhỏ nhất; mở kênh gap ngay |
| P2 | C rồi E | — | C trước để E dogfood được lint |
| P3 | B (+B0 gitignore) | E | Template hash đổi — PR ghi migration `agents init --force` |
| P4 | D | A+B+C+E | Khép vòng; dogfood end-to-end trước khi done |

## Rủi ro & giảm nhẹ

| Rủi ro | Giảm nhẹ |
|--------|----------|
| Gap chất đống không ai xử | P4 giao vòng chạy được ngay; backlog >20 sau 1 tháng → hạ ngưỡng hoặc lịch định kỳ. Lưu ý: gaps đến theo BURST khi dogfood chủ động (~15/ngày đo thật 2026-07-15) |
| Registry thưa → collect mù | `--dir` nguồn chính; fallback luôn kèm warnings |
| Assess/judge không nhất quán | Reason codes + disposition table trong PR body; fail-closed |
| Template hash đổi gây stale đồng loạt | Hành vi đúng; migration 1 dòng |
| Staleness phá deterministic | Cô lập sau `--as-of`; test luôn truyền flag |
| Parser JSONL nhân đôi TS/Python | Ưu tiên shell-out `ui memory query`; nếu parse thì không re-validate |
| Judge rubber-stamp | Checklist ép refute trước; hạ-threshold mặc định reject; 2 lượt fail-closed |
| PR mở rồi bỏ rơi → gap resolved oan | Bổ sung #8: insight chỉ ghi sau MERGE xác nhận; `pr_abandoned` |
