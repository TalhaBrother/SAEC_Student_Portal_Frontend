import axios from 'axios';

// Packaged Electron loads the UI from file://, where hostname is empty.
// In that case the backend is the local Django server started by main.js.
const host =
  window.location.protocol === 'file:' || !window.location.hostname
    ? '127.0.0.1'
    : window.location.hostname;

export const API_ORIGIN = `http://${host}:8000`;

const api = axios.create({
  baseURL: `${API_ORIGIN}/api/`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;