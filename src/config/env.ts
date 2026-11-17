/**
 * Backend base URL, e.g. http://10.0.2.2:4000/api (Android emulator -> host Mac) or
 * http://<mac-lan-ip>:4000/api (physical device). Locally from .env.development (override in .env.development.local);
 * in EAS builds from the profile's env in eas.json. Never `localhost`: on a device that is the phone.
 */
const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;

export const API_BASE_URL = (rawApiUrl ?? '').replace(/\/+$/, '');
export const API_URL_CONFIGURED = API_BASE_URL.length > 0;

/** Reads time out so a dead connection surfaces as an error instead of an endless spinner. */
export const REQUEST_TIMEOUT_MS = 30_000;
