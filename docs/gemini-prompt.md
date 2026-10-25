# Prompt for Gemini — build Mini's Coach v3

Copy everything below the line into Gemini (Antigravity / Gemini CLI), opened in the `fitness` folder.

---

You are working on **Mini's Coach**, an installed web app (PWA) for food, training and weight tracking. Repo: the current folder. Read `docs/v3-plan.md` first — it is the spec. Build it in the phases below, committing after each phase. **Do not deploy anything** (no `firebase deploy`, no `wrangler deploy`, no `git push`). Claude reviews and deploys after you.

## Stack and conventions (follow them exactly)
- Vite 8 + React 19 + TypeScript + Tailwind v4 (`@theme` tokens in `src/index.css`), Dexie (IndexedDB) via `src/lib/db.ts`, lucide-react icons, chart.js lazily.
- **Every user-visible string** goes through `L('عربي مصري', 'English')` from `src/lib/i18n.ts`. Arabic is Egyptian dialect, casual. Layout is RTL in Arabic — use logical classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), never `left/right`.
- UI building blocks live in `src/components/ui.tsx`: `Sheet` (bottom sheet, supports `onBack`), `Seg` (segmented control), `GoogleButton`, `toast`, `tick`. Cards use `className="card"`, floating chrome uses `glass`, buttons use `press`. Match the existing look; no new UI libraries.
- Tabs other than Today are lazy chunks (`React.lazy` in `src/App.tsx`); keep big data out of the main bundle.
- Settings: `getSettings` / `saveSettings` (atomic transaction) / `DEFAULTS` in `db.ts`. Add new fields with defaults.
- **Dexie schema:** current version is 4. Add new tables with `db.version(5).stores({...})`; never change older versions.
- **Cloud sync** (`src/lib/syncCore.ts` → `installSyncHooks`) mirrors *every* Dexie table to Firestore `coachUsers/{uid}/{table}`. New local-only tables (`reports`, `feedbackQueue`) must be **excluded** from those hooks (add a skip list). `routines` **should** sync.
- Test mode: `DEMO` (separate sandbox DB, never syncs). Feature switches: `useFeatures()` in `syncCore.ts` reads Firestore `coachConfig/features`; extend the `Flags` type with `feedback`, `library`, `routines`, `aiV2` (admin in test mode gets all). Gate each new feature on its flag. The Developer page in `src/components/ProfileSheet.tsx` lists publish switches — add one per new flag.
- **Firestore rules are NOT in this repo.** They live in `../Islam app/firestore.rules` (shared Firebase project). Write the rules you need into `docs/firestore-rules-v3.txt` for Claude to merge; do not edit or deploy the Islam app.
- AI relay: `relay/src/index.ts` (Cloudflare Worker, Groq, verifies Firebase ID tokens, admin = `ADMIN_EMAIL`, daily cap in KV). Phone side: `src/lib/ai.ts` (tools run on the phone, `chat()`, `undoTurn()`), privacy gate `src/lib/privacy.ts` (keep it in front of every AI call).
- Food logic: `src/lib/parser.ts` (`parseLine`, `search`, `norm`), `src/lib/foods.ts` (`FOODS`, `SERVING`), calories via `compute()` in `src/lib/calc.ts`. Exercises today: `src/lib/exercises.ts` (53 Arabic/English exercises, `PROGRAMS`, `e1rm`, `workoutKcal`), training logic `src/lib/training.ts`, UI `src/components/Exercise.tsx`, `ProgramPicker.tsx`.
- **Tests:** `npm test` runs `src/lib/selfcheck.ts` (node, plain `assert`). Add asserts for every new pure function. Keep pure logic in files that do not import Firebase (e.g. not `ai.ts`/`sync.ts`) so the test runner can load them.
- Before each commit: `npm test` and `npm run build` must pass (build runs `tsc -b`).
- **Free tiers only.** No paid APIs, no Firebase Storage, no new keys.
- Privacy: automatic error reports and feedback must never include food, weight, notes, names or emails beyond what the person types into the feedback box. AI context stays anonymous (see `context()` in `ai.ts`).

## Phase 1 — Feedback (spec section 1)
1. `src/lib/reports.ts` (no Firebase imports): `captureError(err, where)` → dedupe key = message + first stack line; store/update `{key, message, stack (≤1000 chars), version, tab, ua, firstAt, lastAt, count, sent}` in Dexie table `reports`. Install `window.onerror` + `unhandledrejection` listeners in `main.tsx`. Pure helper `reportKey(message, stack)` with tests.
2. `src/components/ErrorBoundary.tsx`: wraps each tab in `App.tsx`; on error calls `captureError` and shows a card "حصلت مشكلة — اتبعتت للمطور تلقائياً" + "حاول تاني" (resets the boundary).
3. Also capture: failed AI calls (in `ai.ts` catch), sync errors (`sync.ts` reconcile failure).
4. Upload: when signed in and flag `feedback` on, push unsent reports and queued feedback to Firestore `coachFeedback` (add `sendFeedback`/`flushReports` to `sync.ts`, expose through `syncCore.ts` like the other calls). Mark sent.
5. Profile → new row "💬 رأيك يهمنا" → page with type (bug / idea / other), text, optional "كنت بعمل إيه", Send. Offline → `feedbackQueue`.
6. Developer page → "📊 ملخص الملاحظات": admin reads `coachFeedback` (Firestore), calls new relay endpoint `POST /summarize` (admin-only; same token check as `/models`), shows the summary with Copy and "copy as task prompt" buttons, and "mark done" (deletes the docs).
7. Write the Firestore rules block for `coachFeedback` into `docs/firestore-rules-v3.txt` (signed-in create with field/size validation; admin read/delete).

## Phase 2 — Exercise library + animations (spec section 2)
1. Script `tools/build-exercises.mjs`: downloads `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json` (876 items, Unlicense), keeps `id, name, category, equipment, level, primaryMuscles, secondaryMuscles, instructions, images`, writes `public/exercises.json`. Commit the generated file. Credit the dataset (and its Unlicense) in About.
2. `src/lib/library.ts` (pure): types; `loadLibrary()` (fetch `/exercises.json`, memoized); mapping dataset muscles → `react-body-highlighter` muscles; place classification (gym / home / outside) from equipment; search over English names + Arabic names; `ACTIVITIES` (~40 outdoor/sport/cardio entries with Arabic+English names and MET values) and `activityKcal(met, kg, minutes)`. Tests for mapping, classification, search, kcal.
3. Arabic names: map the 53 existing exercises in `exercises.ts` to dataset ids where they match (keep their Arabic names/tips), and add Arabic names for ~150 more of the most common dataset exercises in a table in `library.ts`.
4. `ExerciseAnimation` component: 2-frame crossfade of `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/<image>` (1.2 s per frame), lazy `<img loading="lazy">`, alt text, reduced-motion → side-by-side stills. Add a Workbox `runtimeCaching` CacheFirst rule for `cdn.jsdelivr.net` (maxEntries 300) in `vite.config.ts`.
5. Library UI (Train tab, behind flag `library`): search box + filter chips (place, equipment, muscle, category, level), results list with thumbnail, exercise sheet (animation, muscles on the body map, instructions, "add to routine"). Body map muscle tap opens the library filtered by that muscle.

## Phase 3 — Routines and schedule (spec section 2)
1. Dexie table `routines`: `{id, name, schedule: {mode: 'days' | 'rotation', days: number[] (0=Sun), time?: 'HH:MM'}, exercises: [{ref: {kind: 'lib'|'activity'|'legacy', id}, type: 'reps'|'time'|'distance', sets, reps?, kg?, seconds?, meters?, restSec, notes?}], createdAt, updatedAt}`.
2. Pure logic in `src/lib/routines.ts`: `nextSession(routines, workouts, now)` (by days/time or rotation), `routineToWorkout(routine)`, `templateFromProgram(program)` (built-in programs → editable copies). Tests.
3. UI (behind flag `routines`): "روتيناتي" list (create / edit / duplicate / delete), editor (add exercises from the library or activities, reorder, per-exercise type and values, rest), schedule picker (days chips + time), "copy a template" from built-in programs.
4. Today tab card: next scheduled session with time → Start. Train tab: week strip (scheduled vs done).
5. Logger (`Exercise.tsx` `Logger`): support `time` (countdown/stopwatch) and `distance` rows; activities log minutes and show calories (`activityKcal`). Workouts store `routineId` when started from a routine. Keep the existing program flow working when no routine exists.

## Phase 4 — AI coach v2 (spec section 3)
In `src/lib/ai.ts` (behind flag `aiV2`; v2.5 behavior stays when off):
1. New tools: `food_info`, `search_exercises`, `create_routine` (saves with Undo), `log_activity`, `set_targets` (only after explicit confirmation in the conversation; Undo restores old values), `get_history`. Validate every argument like the existing `run()` does (`clamp`, length limits).
2. System prompt: warmer human persona, playbooks (portion planning with `food_info`, building a routine — ask 2–4 short questions if goal/days/place/equipment/time are missing —, plateaus, eating out, missed days, low motivation), follow-ups from notes.
3. History: today's messages + a short on-phone summary of the last 3 days (pure function, tested).
4. Keep the privacy gate first, the context anonymous, and the payload compact (≈2–3k tokens).
5. Relay: no change needed for tools; only the `/summarize` endpoint from Phase 1.

## Phase 5 — Wrap up
- Add the new flags to the Developer page publish list, update `DEFAULTS`, run `npm test` + `npm run build`, and write `docs/v3-notes.md`: what you built, what you skipped and why, anything you were unsure about, and the exact Firestore rules for Claude to merge.
- Do not deploy. Do not push.
