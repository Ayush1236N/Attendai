import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Section 37: Local Development Architecture.
// This MUST be a URL reachable from the PHONE — never "localhost", since on
// the phone "localhost" refers to the phone itself, not your computer.
//
// Set it via an env var so you don't have to hand-edit this file per machine:
//   EXPO_PUBLIC_API_URL=http://192.168.1.10:5000/api npx expo start
// or put EXPO_PUBLIC_API_URL=... in a .env file next to package.json.
// Falls back to a placeholder LAN IP if nothing is set.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://192.168.68.108:5000/api';

const client = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

const TOKEN_KEY = 'employee_token';
const PROFILE_KEY = 'employee_profile';

// The employee self-service login (My Account) is entirely separate from
// face check-in/out, which stays password-free. Token lives in SecureStore
// (encrypted at rest) rather than plain AsyncStorage.
export async function saveSession(token, employee) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(employee || {}));
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredProfile() {
  const raw = await SecureStore.getItemAsync(PROFILE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(PROFILE_KEY);
}

// App.js registers a callback here so that when the server says the session is
// gone (logged out remotely, expired), the UI drops back to the login page
// instead of staying on a screen full of failing requests.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on a normal request means the session is no longer valid. We do NOT
// treat 401s from the login / 2FA endpoints (wrong password, wrong code) as a
// dead session, and face-scan failures use 422 on the server.
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const url = err.config?.url || '';
    const isAuthAttempt = url.startsWith('/auth/') && !url.includes('logout');
    if (err.response?.status === 401 && !isAuthAttempt) {
      await clearSession();
      if (unauthorizedHandler) unauthorizedHandler();
    }
    return Promise.reject(err);
  }
);

export default client;
