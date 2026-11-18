# Setup

Requirements: Node ≥ 22.13 (Expo SDK 58), npm. For local emulator/APK builds: JDK 17 + Android SDK (not installed on this Mac yet) — or use EAS cloud builds (`npx eas-cli@latest login`).

```bash
npm install
# .env.development already points at the emulator; for a physical phone put your Mac's LAN IP in .env.development.local
npm run sync-types                 # refresh src/types/medicore from ../Medicore/packages/shared-types
npm test && npm run typecheck && npx expo lint
npm run emulator                   # local Android emulator + Expo Go (see docs/RUN-ON-EMULATOR.md)
```
No emulator yet? `npm run emulator:setup` installs one without Android Studio: see [RUN-ON-EMULATOR.md](RUN-ON-EMULATOR.md).
Backend: run `pnpm local` in the Medicore repo (API on :4000). Emulator → `http://10.0.2.2:4000/api`; physical device → `http://<mac-lan-ip>:4000/api` (same Wi-Fi; the API listens on all interfaces, so allow port 4000 through the macOS firewall).
Builds: `npx eas-cli build -p android --profile development` (emulator dev build) / `--profile development-device` (dev build for a phone) / `--profile preview` (APK) / `--profile production` (AAB). Replace the `REPLACE_WITH_*` placeholders in `eas.json` first: staging and production must be HTTPS (release builds block plain HTTP), and production must be the same API as the web's `NEXT_PUBLIC_API_URL`. Signing keys are managed by EAS; never commit keystores (`*.jks` is git-ignored).
Package ID `com.medicore.app` is a placeholder — change before the first Play upload (permanent afterwards).
