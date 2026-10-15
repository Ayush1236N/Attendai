import axios from 'axios';

// Separate client from admin api/client.js: the employee portal uses its own
// token (employee_token) so admin and employee sessions never collide,
// even if both are logged in on the same browser.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const employeeClient = axios.create({ baseURL: BASE_URL });

employeeClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('employee_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

employeeClient.interceptors.response.use(
  (res) => res,
  (err) => {
    // A 401 means the login session is gone. (Face-scan failures use 422, and
    // are additionally excluded here so a bad photo can never sign you out.)
    const isFaceScan = /\/attendance\/me\/check-(in|out)/.test(err.config?.url || '');
    if (err.response?.status === 401 && !isFaceScan) {
      localStorage.removeItem('employee_token');
      localStorage.removeItem('employee_name');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default employeeClient;
