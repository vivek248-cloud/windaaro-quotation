// Single place for the backend address. Set VITE_API_BASE_URL in
// frontend/.env (e.g. VITE_API_BASE_URL=https://example.com/api) when deploying.
const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const API_BASE_URL = (configured || "http://127.0.0.1:8000/api").replace(
  /\/+$/,
  ""
);
