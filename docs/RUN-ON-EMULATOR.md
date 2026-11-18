# Run the app in an Android emulator on this Mac

The app runs in **Expo Go** inside a local Android emulator, against the same local API and MongoDB as the web app.
No Android Studio and no native build are needed. On macOS 13, Homebrew can't install the tools, so everything is
downloaded directly into `~/Library/Android`.

## One-time setup
Already installed here: Node ≥ 22.13, pnpm, and MongoDB (started by `pnpm local`).

```bash
cd ~/Desktop/MedicoreApp
npm install
npm run emulator:setup      # Java 17 + Android SDK tools + emulator + Android 15 image + virtual phone "Medicore_API_35"
```
`emulator:setup` downloads about 2.5 GB, needs about 7 GB of disk space, and accepts the Android SDK licenses.

## Every time
Terminal 1, the API. On this 8 GB Mac, run **only the API** while the emulator is open:
```bash
cd ~/Desktop/Medicore
pnpm --filter @medicore/api start   # API on :4000 (MongoDB must be running; `pnpm local` starts it)
# or, when you also want the web app on :3000 (heavier):  pnpm local
```
Terminal 2, the app:
```bash
cd ~/Desktop/MedicoreApp
npm run emulator            # boots the emulator if needed, installs Expo Go on it, opens the app
```
In the Metro terminal, press `a` to reopen the app on the emulator and `r` to reload. Ctrl+C stops Metro; the emulator
keeps running until you close its window.

The first boot takes a few minutes on this Mac. Later starts are quicker.

## Login and data
- Database: `medicore_share` (from `MONGO_URI` in `~/Desktop/Medicore/apps/api/.env`).
- Demo login: **demo.admin / Demo@12345**. It has 4 products with 200 units each, 3 customers and a vendor.
- To re-add the demo catalog, in the Medicore repo:
  `MONGODB_URI='mongodb://127.0.0.1:27017/medicore_share?replicaSet=rs0' pnpm --filter @medicore/api seed:demo`. It asks you to type "yes".
- Changes made in the app show up on the web (http://localhost:3000) and the other way round: one API, one database.

## How the emulator reaches the API
- Inside the emulator, `10.0.2.2` is this Mac. `.env.development` sets `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api`.
- Don't set `EXPO_PUBLIC_API_URL` in `.env.development.local` or `.env.local`: those override it. `npm run emulator` warns if one does.
- After changing an env value, reload the app (`r`). If the old value sticks, run `npx expo start --android --clear`.

## Troubleshooting
- **The emulator is very slow.** This Mac has 8 GB of RAM and a 2015 dual-core CPU. Run only the API (not `pnpm local`), close browser tabs, and stop services you don't need (Elasticsearch was also running). The first boot is the slowest, because Google Play services set up in the background. The virtual phone uses 2 GB (`hw.ramSize` in `~/.android/avd/Medicore_API_35.avd/config.ini`).
- **The emulator window closes by itself.** The host GPU path crashes on this Mac's graphics (`Failed to find ColorBuffer`), so `npm run emulator` uses software rendering (`-gpu swiftshader_indirect`). Don't start it with `-gpu host`.
- **Stuck on "Bundling 20%".** The emulator can't reliably reach the Mac's Wi-Fi IP, so `npm run emulator` uses `--localhost` (adb forwards port 8081). If you start Metro yourself, use `npx expo start --android --localhost`.
- **"Failed to install Expo-Go…apk: Broken pipe".** The emulator wasn't ready yet. Run `npm run emulator` again; it now waits for Android's package manager.
- **"Network request failed" / can't log in.** Check that `curl http://localhost:4000/api/health` on the Mac says `"mongo":"connected"`, then reload the app.
- **Expo Go asks you to log in.** Since Sept 2026, Expo Go requires a free Expo account. Sign in inside Expo Go, or run `npx expo login` here.
- **Start from a clean emulator.** Run `~/Library/Android/sdk/emulator/emulator -avd Medicore_API_35 -wipe-data`.
- **Remove everything.** Run `rm -rf ~/Library/Android ~/.android/avd/Medicore_API_35.*`.
