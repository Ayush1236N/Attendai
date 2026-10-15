import axios from 'axios';

// Used by the employee check-in kiosk page. Deliberately separate from
// api/client.js: this page has no login, is reachable by anyone with the
// link, and must never attach an admin/employee auth token even if one
// happens to be sitting in localStorage on the same browser.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const publicClient = axios.create({ baseURL: BASE_URL, timeout: 15000 });

export { BASE_URL };

export default publicClient;
