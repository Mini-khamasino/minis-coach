# Mini's Coach v3 — plan

Four upgrades, built behind feature switches, tested in admin test mode, then published.
Everything stays on free tiers (Firebase Spark, Cloudflare Workers free, Groq free). No new paid services.

---

## 1. Feedback — automatic + manual, summarized by AI

**Automatic (bugs the person never reports)**
- Catch: `window.onerror`, `unhandledrejection`, a React error boundary around each tab, failed AI calls, sync errors.
- Each report: message, short stack, app version, tab, device (user agent), time, how many times. **No food, weight or personal data.**
- Deduplicate on the phone (same message + first stack line = one report with a count), keep in a local Dexie table `reports`, upload when signed in.
- The error boundary shows a friendly "حصلت مشكلة — اتبعتت للمطور تلقائياً" card with a "حاول تاني" button instead of a white screen.

**Manual (Profile → 💬 رأيك يهمنا)**
- Type: 🐞 مشكلة / 💡 فكرة / 💬 حاجة تانية, a text box, optional "اللي كنت بعمله" line.
- Auto-attached: app version, device, the last 3 automatic reports (ids only).
- Works offline: queued locally, sent when signed in.

**Storage**
- Firestore collection `coachFeedback/{id}` — any signed-in user can **create** (not read/edit); only the admin can read/delete.
- Rules live in the Islam app's `firestore.rules` (shared project) — add a block there, never deploy rules from this repo.

**AI summary (admin only)**
- Developer page → "📊 ملخص الملاحظات": fetches all feedback, sends it to a new relay endpoint `/summarize` (admin-only), Groq returns:
  bugs grouped and ranked by how many people/times, feature requests ranked, quick wins, and a ready-to-paste task prompt for Claude/Gemini.
- Buttons: copy summary, copy as task prompt, mark items done (deletes them).
- shortcut: on demand only (no nightly job) — a Cloudflare cron would need a Firebase service account; add later if feedback volume grows.
- Screenshots: not included — Firebase Storage needs the paid plan for new buckets.

---

## 2. Exercises — a full library + your own routines

**Library (~900 entries)**
- Source: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) — 876 exercises, public domain (Unlicense), with instructions, primary/secondary muscles, equipment, level, category (strength, stretching, plyometrics, powerlifting, olympic, strongman, cardio) and 2 photos each.
- Ship a slimmed copy as `public/exercises.json` (id, name, category, equipment, level, muscles, instructions, image paths). Load lazily, never in Dexie, never synced.
- Add ~40 **activities** the dataset lacks (outside/sports/cardio): walking, running, cycling, swimming, football, padel, tennis, basketball, hiking, stairs, jump rope, boxing, martial arts, yoga, pilates, HIIT, rowing, elliptical, dancing… each with a MET value (Compendium of Physical Activities) for calories = MET × kg × hours.
- Arabic names: keep the 53 existing Arabic exercises (map them to dataset ids where they match) + Arabic for the ~150 most common; the rest show English with Arabic muscle/equipment labels.
- Filters: place (gym / home / outside), equipment, muscle, category, level, plus search (Arabic + English). Muscle filter works with the existing body map (dataset muscles → body-map muscles mapping).

**Animations (bonus)**
- Each dataset exercise has start/end photos → loop them as a 2-frame crossfade (CSS, ~1.2 s per frame) = a clear "how to do it" animation. Shown in the exercise sheet, the library, and the workout logger (tap ⓘ).
- Images load from jsDelivr (`cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/<path>`), cached by the service worker (CacheFirst, ~300 entries) so used ones work offline.
- `prefers-reduced-motion`: show the two photos side by side instead of animating.

**Your own routines ("packages")**
- Create / edit / duplicate / delete a routine: name, exercises in order, per exercise: sets × reps × weight, or time, or distance (by exercise type), rest seconds, notes.
- Schedule: days of the week + optional time ("الأحد والتلات 6 مساءً"), or "rotation" (next day after the last done, like today's programs).
- Built-in programs become **templates** you can copy into your routines and change.
- Today tab: "النهارده: Push · 6:00 م" card → start. Train tab: week strip showing scheduled vs done.
- Logger: supports reps+kg, time (timer), distance+time; activities log duration and give calories.

---

## 3. AI coach v2 — skills, not just chat

New tools (run on the phone, like today):
- `food_info(names[])` → per-100 g values from the app's table/your foods, so portion math is grounded.
- `recommend_portions(...)` is done by the model using `food_info` + remaining kcal/protein — it answers "how much rice and chicken can I eat for dinner?" with grams.
- `search_exercises(query, muscle, equipment, place)` → ids from the library.
- `create_routine(name, schedule, exercises[])` → saves a routine (with Undo); it asks 2–4 short questions first if it lacks goal / days / place / equipment / time per session.
- `log_activity(name, minutes, distance?)` → cardio/sports with MET calories.
- `set_targets(kcal?, protein?, water?)` → only after the person confirms in the chat; Undo restores the old values.
- `get_history(days)` → compact daily totals + weights + workouts for trend questions.

Behavior:
- Persona: warm Egyptian coach, talks like a person (short, specific, a bit of humor), remembers notes, follows up ("امبارح قلت رجلك وجعاك — عاملة إيه؟").
- Playbooks in the system prompt: portion planning, building a routine, plateaus, eating out, low motivation, missed days.
- History: today's chat + a 3-line summary of the last 3 days' conversations (generated on the phone from stored messages).
- Same privacy gate and anonymous context as v2.5; same relay; same 200/day cap.
- Groq limits: keep the context compact (≈2–3k tokens); tools return short JSON.

---

## 4. Rollout

- Feature switches (Firestore `coachConfig/features`): `feedback`, `library`, `routines`, `aiV2` (in addition to `ai`). Admin test mode gets all of them.
- Dexie: new tables `reports`, `feedbackQueue`, `routines` (version 5). Existing data untouched.
- Tests in `src/lib/selfcheck.ts` for: error dedupe, MET calories, schedule "next session" logic, routine → workout conversion, dataset muscle mapping, new AI tool argument validation.
- Executed by Gemini (see `docs/gemini-prompt.md`), then reviewed, polished and deployed by Claude.
