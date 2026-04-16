/**
 * Core API Client and Configuration
 */

// Configuration loaded from Environment
export const API_CONFIG = {
  LOANIQ_BASE_URL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
  DUCO_BASE_URL: import.meta.env.VITE_DUCO_API_URL || "http://localhost:8000",
  RECONCILE_BASE_URL: import.meta.env.VITE_RECONCILE_API_URL || "http://127.0.0.1:8000",
  SANTIX_WEBHOOK_URL: import.meta.env.VITE_WEBHOOK_URL || "https://anxomencias.app.n8n.cloud/webhook/bc95dbc9-772d-4890-942b-9c4d576646c1",
};

/**
 * Base fetch client resolving JSON responses and throwing consistent errors.
 */
export async function fetchClient<T = any>(
  url: string,
  options?: RequestInit & { parseJson?: boolean }
): Promise<T> {
  const { parseJson = true, ...fetchOptions } = options || {};
  
  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      let errorMessage = `Server responded with ${response.status} ${response.statusText}`;
      try {
        const errText = await response.text();
        if (errText) errorMessage = `Server ${response.status}: ${errText}`;
      } catch (e) {
        // Fallback to initial error message if body can't be read
      }
      throw new Error(errorMessage);
    }

    if (!parseJson) {
      return response as any;
    }

    // Attempt to parse JSON. Some endpoints might return empty body 200 OK.
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "Failed to fetch") {
        throw new Error(`Could not reach API at ${url}. Check that the backend is running and accessible.`);
      }
      throw error;
    }
    throw new Error('Unknown error occurred during fetch');
  }
}
