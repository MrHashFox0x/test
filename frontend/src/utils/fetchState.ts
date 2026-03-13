const STATE_FILE_URL = import.meta.env.VITE_STATE_FILE_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

/**
 * Fetch the latest protocol state from the API.
 * Automatically includes the API key header when configured.
 */
export async function fetchProtocolState(): Promise<any> {
  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers['X-API-KEY'] = API_KEY;
  }

  const response = await fetch(STATE_FILE_URL, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch state: ${response.statusText}`);
  }

  return response.json();
}
