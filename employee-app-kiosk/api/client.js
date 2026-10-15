import axios from 'axios';

// This MUST be a URL reachable from the DEVICE — never "localhost".
// Set it via an env var so you don't have to hand-edit this file per device:
//   EXPO_PUBLIC_API_URL=http://192.168.1.10:5000/api npx expo start
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://192.168.68.108:5000/api';

// The kiosk app never logs in and never stores a token — it only ever calls
// the open, unauthenticated check-in/check-out endpoints, which identify
// the employee purely from their face (matched against everyone registered).
const client = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

export default client;
