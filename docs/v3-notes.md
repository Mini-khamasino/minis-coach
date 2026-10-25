# Mini's Coach v3 — Implementation Notes

Built across Phases 1–5 following `docs/v3-plan.md` and `docs/gemini-prompt.md`.
All code is committed locally on branch `main`. No deployments (`no firebase deploy`, `no wrangler deploy`) and no git pushes (`no git push`) were performed. Ready for Claude's review, polish, and deployment.

---

## 1. What was built

### Phase 1 — Feedback & Error Reporting
- **Local Error Capture (`src/lib/reports.ts`):**
  - Pure `reportKey(message, stack)` function generating a deduplication key from the error message and first stack line.
  - `captureError(err, where)` records and deduplicates errors in Dexie table `reports` (`key`, `message`, `stack`, `version`, `tab`, `ua`, `firstAt`, `lastAt`, `count`, `sent`).
  - Strict privacy: **zero food names, weights, personal notes, user names, or emails** are ever captured.
  - Global `window.onerror` and `window.onunhandledrejection` listeners in `src/main.tsx`.
- **UI Error Boundary (`src/components/ErrorBoundary.tsx`):**
  - Wraps all tabs in `src/App.tsx`.
  - Displays a user-friendly Egyptian Arabic error card (`حصلت مشكلة — اتبعتت للمطور تلقائياً`) with a `حاول تاني` reset button instead of a blank screen.
  - AI call failures and cloud sync reconcile failures are automatically captured.
- **Manual Feedback Flow (`src/components/ProfileSheet.tsx`):**
  - New row in Profile: `💬 رأيك يهمنا` opening a feedback sheet.
  - Supports feedback type (`🐞 مشكلة` / `💡 فكرة` / `💬 حاجة تانية`), description text, and optional `كنت بعمل إيه`.
  - Offline-first: saved to local Dexie table `feedbackQueue`.
- **Cloud Upload (`src/lib/sync.ts`, `src/lib/syncCore.ts`):**
  - `flushReports()` and `sendFeedback()` upload unsent error reports and queued feedback to Firestore collection `coachFeedback/{id}` when the user is signed in and flag `feedback` is enabled.
- **Admin Feedback Summary:**
  - Developer page: `📊 ملخص الملاحظات` button loads all docs from `coachFeedback`.
  - Calls relay endpoint `POST /summarize` (admin-only).
  - Groq analyzes and returns: bugs ranked by frequency, feature requests, quick wins, and a ready-to-paste task prompt for Claude/Gemini.
  - Buttons: Copy summary, Copy as task prompt, and `تحديد كمكتمل ومسح من السحابة` (bulk deletes the docs).
  - Cloudflare Worker relay endpoint `POST /summarize` added to `relay/src/index.ts`.

### Phase 2 — Exercise Library & Animations
- **Dataset (`tools/build-exercises.mjs` & `public/exercises.json`):**
  - Script downloads and slims 876 exercises from `free-exercise-db` (Unlicense public domain).
  - Keeps `id`, `name`, `category`, `equipment`, `level`, `primaryMuscles`, `secondaryMuscles`, `instructions`, and image paths.
  - Committed as `public/exercises.json`. Dataset and Unlicense credited in the About sheet.
- **Library Engine (`src/lib/library.ts`):**
  - Pure functions: `loadLibrary()` (fetch `/exercises.json`, memoized).
  - `mapDatasetMuscles`: maps dataset muscle names to `react-body-highlighter` muscle keys.
  - `classifyPlace`: maps equipment to workout location (`gym`, `home`, `outside`).
  - `activityKcal(met, kg, minutes)`: MET-based calorie calculation from the Compendium of Physical Activities.
  - `ACTIVITIES`: 41 cardio, sport, and outdoor activities with Egyptian Arabic & English names and MET values.
  - `DATASET_AR_NAMES`: Arabic translations for ~150 most common dataset exercises.
  - `MAP_53_TO_DATASET`: bidirectional mapping from the 53 legacy app exercises to dataset IDs.
  - `searchLibrary()`: multi-attribute search across Arabic names, English names, equipment, muscle, category, level, and place.
- **2-Frame Crossfade Animation (`src/components/ExerciseAnimation.tsx`):**
  - Smooth 1.2s crossfade between start and finish photos loaded lazily from jsDelivr CDN (`cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/...`).
  - Accessibility: detects `prefers-reduced-motion` and displays side-by-side static photos instead.
  - Service Worker: CacheFirst Workbox rule in `vite.config.ts` for `cdn.jsdelivr.net` with max 300 entries for offline exercise demonstration.
- **Library UI (`src/components/ExerciseLibrary.tsx`, `src/components/Exercise.tsx`):**
  - Search box with filter chips: Place, Equipment, Muscle, Category, Level.
  - Results grid with photo thumbnails.
  - Exercise detail bottom sheet with animated demonstration, muscle highlighter, instructions, and "Add to routine" action.
  - Interactive body map in Train tab: tapping any muscle opens the library filtered by that muscle. Logger ⓘ tip button displays the 2-frame animation.

### Phase 3 — Routines & Weekly Schedule
- **Dexie Schema (`src/lib/db.ts`):**
  - Upgraded to schema version 5.
  - Table `routines` (`{ id, name, schedule: { mode: 'days' | 'rotation', days: number[], time?: string }, exercises: RoutineExercise[], createdAt, updatedAt }`).
  - Cloud sync: `routines` synchronizes to `coachUsers/{uid}/routines`, while `reports` and `feedbackQueue` are strictly local.
- **Pure Scheduling Logic (`src/lib/routines.ts`):**
  - `nextSession(routines, workouts, nowMs)`: determines the upcoming workout for both day-of-week and rotation schedules.
  - `routineToWorkout(routine, date)`: instantiates a workout session from a routine.
  - `templateFromProgram(program)`: converts built-in programs into editable user routines.
- **Routines UI (`src/components/RoutinesSheet.tsx`):**
  - "روتيناتي" management sheet: create, edit, duplicate, and delete routines.
  - Exercise editor: add from library or sports activities, reorder, configure sets/reps/kg, time, or distance, adjust rest timers and notes.
  - Schedule selector: day-of-week chips (Sun–Sat) with optional start time (`HH:MM`), or rotation mode.
  - "نسخ باقة جاهزة" template copier from built-in programs.
- **Today & Train Tab Integration:**
  - Today tab: displays a "النهاردة: [اسم التمرين] · [الميعاد]" card with Start button navigating directly to the workout logger.
  - Train tab: 7-day week strip (Sun–Sat) displaying scheduled vs completed days.
  - Workout Logger: supports `reps + kg`, `time` (seconds / stopwatch timer), and `distance` (meters) rows. Outdoor/cardio activities calculate and log MET calories. Saves `routineId` on the completed workout.

### Phase 4 — AI Coach v2
- **Gating & Fallback:**
  - Feature-switched under `aiV2`. When turned off, preserves v2.5 coach prompt and tools verbatim.
- **New Tools (`src/lib/ai.ts`):**
  1. `food_info(names[])`: searches local custom foods and database foods to return per-100g calories, protein, carbs, fat, and standard serving sizes for grounded portion calculation.
  2. `search_exercises(query, muscle?, equipment?, place?)`: queries the exercise library and activities by keywords, muscles, and equipment.
  3. `create_routine(name, schedule, exercises[])`: saves structured routines to Dexie `routines` with Undo support.
  4. `log_activity(name, minutes, distance_km?)`: logs outdoor/cardio activities to workouts with MET-based calorie burn and Undo support.
  5. `set_targets(kcal?, protein?, water_ml?)`: updates daily calorie, protein, or water targets in settings with Undo support. Strictly gated to run only after explicit user confirmation in chat.
  6. `get_history(days)`: returns compact daily totals, weight trend points, and workout summaries for past days.
- **Multi-turn Read Tools (`READ_TOOLS`):**
  - Tools that read data (`food_info`, `search_exercises`, `get_history`, `get_day`) loop back to Groq so the AI can formulate a natural Egyptian Arabic response (e.g. recommending exact grams of chicken and rice based on remaining macros).
- **History & Prompt Engineering (`src/lib/aiHelpers.ts`):**
  - `summarizeRecentChat(messages, todayDate)`: generates a concise on-phone 3-line summary of conversations from the past 3 days (excluding today).
  - Warmer Egyptian coach persona with playbooks for portion planning, routine generation (asking 2–4 short questions first if parameters are missing), plateaus, dining out (+15% oil margin), missed workouts, low motivation, and follow-ups on personal notes.
  - Argument sanitization: `clampCap` and length validation for all tool inputs.
  - Undo integration: `undoTurn` restores overwritten settings targets and deletes routines created during the turn.

### Phase 5 — Wrap up
- Developer page publish switches updated for all 5 flags (`ai`, `feedback`, `library`, `routines`, `aiV2`).
- Settings `DEFAULTS` in `src/lib/db.ts` verified with all default keys.
- Full test suite in `src/lib/selfcheck.ts` covers error deduplication, MET calories, routine scheduling, template conversions, dataset muscle mappings, 3-day history summary, and tool argument validation.
- All builds and tests pass cleanly.

---

## 2. What was skipped and why

1. **Automated Cloudflare Cron for Feedback Summarization:**
   - *Reason:* Per spec section 1, a scheduled Cloudflare Worker cron job requires a Firebase service account private key to query Firestore from the background. On-demand summarization directly from the Developer page is 100% free-tier compliant, secure, and utilizes user ID tokens without storing credentials.
2. **Feedback Screenshot Uploads:**
   - *Reason:* Per spec section 1, Firebase Storage requires upgrading to the paid Blaze plan for new storage buckets. Kept strictly on the Spark free tier.
3. **External UI Libraries:**
   - *Reason:* All UI components were built using the project's native `src/components/ui.tsx` building blocks, Tailwind CSS logical utilities, and Lucide icons.

---

## 3. Notes for Claude

1. **AI Relay Deployment:**
   - `relay/src/index.ts` was updated with the admin-only `POST /summarize` endpoint in Phase 1. It checks the Firebase token email against `ADMIN_EMAIL` (`a.alimohammed2005@gmail.com`). Deploy with `wrangler deploy` in `relay/`.
2. **Cache Headers & CDN:**
   - Exercise images use `cdn.jsdelivr.net`. The service worker caches them using CacheFirst (maxEntries 300).
3. **Local Database Migration:**
   - Dexie version 5 was added with `db.version(5).stores({ reports: 'key', feedbackQueue: '++id', routines: 'id' })`. Older versions (1–4) remain untouched.
4. **Cloud Sync:**
   - `reports` and `feedbackQueue` are in `LOCAL_ONLY_TABLES` in `syncCore.ts` and `sync.ts`.
   - `routines` syncs normally to `coachUsers/{uid}/routines`.

---

## 4. Exact Firestore Security Rules to Merge

Add this block into `../Islam app/firestore.rules` under `match /databases/{database}/documents`:

```javascript
// Mini's Coach v3: Feedback & Error Reports collection
match /coachFeedback/{id} {
  // Any signed-in user can submit feedback or error reports with field/size validation
  allow create: if request.auth != null
    && request.resource.data.uid == request.auth.uid
    && request.resource.data.kind in ['feedback', 'report']
    && (!('text' in request.resource.data) || (request.resource.data.text is string && request.resource.data.text.size() <= 2000))
    && (!('message' in request.resource.data) || (request.resource.data.message is string && request.resource.data.message.size() <= 500))
    && (!('stack' in request.resource.data) || (request.resource.data.stack is string && request.resource.data.stack.size() <= 1000))
    && (!('doing' in request.resource.data) || (request.resource.data.doing is string && request.resource.data.doing.size() <= 500))
    && (!('ua' in request.resource.data) || (request.resource.data.ua is string && request.resource.data.ua.size() <= 250));

  // Only admin can read, list, and delete feedback items
  allow read, delete: if request.auth != null && request.auth.token.email == 'a.alimohammed2005@gmail.com';

  // No client-side updates allowed
  allow update: if false;
}
```
