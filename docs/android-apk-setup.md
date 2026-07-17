# EventoPro — Android App (APK) + CI

EventoPro is a **web app first**. The same app also ships as an **installable
Android APK** built from the identical code with **Capacitor**, and the web UI
shows a **"Get the Android App"** button once an APK is published.

There are two ways to run it on a phone:

| Option | How | Store? | Auto-updates? |
|--------|-----|--------|---------------|
| **PWA (already built)** | Open the site → browser menu → *Install app* | No | ✅ automatic |
| **APK (this doc)** | Download `eventpro.apk` → install | No (sideload) | ✅ automatic |

Both auto-update because they load the **live deployed site** — you only rebuild
the APK if you change the icon, name, permissions, or the server URL.

---

## Build the APK (cloud — no Android Studio needed)

1. **Push the repo to GitHub** (branch `hasim` or `main`).
2. It builds automatically on **every push to `main`** (and on version tags `v1.0.0`),
   or run it manually: **Actions → "Build Android APK" → Run workflow**.
   > Note: you rarely need to rebuild — the APK loads the live site, so content/UI
   > updates reach installed apps automatically. Rebuild only for icon/name/permission/URL changes.
3. GitHub installs Capacitor, wraps the app, compiles a debug APK, and publishes it
   to the **`apk-latest`** release. Stable download URL:
   ```
   https://github.com/<OWNER>/<REPO>/releases/download/apk-latest/eventpro.apk
   ```

## Show the "Get the Android App" button
After the first build, set the release URL in `frontend/js/app.js`:
```js
const APK_URL = 'https://github.com/<OWNER>/<REPO>/releases/download/apk-latest/eventpro.apk';
```
Redeploy the frontend. The button appears on the login screen (and is hidden when
you're already inside the installed app).

## Install on a phone
1. Open the site on the phone → tap **Get the Android App** (or open the release URL).
2. Open the downloaded `eventpro.apk`; allow "install from this source" when prompted.
3. Launch and sign in — it talks to the deployed backend like a native app.

## Which URL the app loads
`frontend/capacitor.config.json` → `server.url` points at the deployed **frontend**
site. If that URL changes, edit it there and rebuild once.

## Notes
- The APK is a **debug** build (auto-signed) — installable by sideloading, fine for
  internal/demo distribution. For the Play Store, add a release keystore + `assembleRelease`.
- Content updates need no rebuild; the app loads the live site on open (needs internet;
  free Render cold-start ~50s applies on first open after idle).
- Building locally instead needs JDK 17 + Android SDK, then:
  `cd frontend && npm install && npx cap add android && npx cap sync android && (cd android && ./gradlew assembleDebug)`

---

## Continuous Integration (tests)

`.github/workflows/tests.yml` runs the **pytest suite on every push and pull
request** against an isolated SQLite DB (never TiDB), with AI disabled — so no
secrets are needed. A failing check flags broken code before it ships.

**Convention:** when you add a feature, add a test for it in `backend/tests/`.
The CI check then proves it works and guards against regressions. Run locally:
```bash
cd backend && pytest -q
```
