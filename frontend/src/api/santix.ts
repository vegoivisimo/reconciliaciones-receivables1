import { API_CONFIG, fetchClient } from "./client";

/**
 * Santix Feature API Domain
 */
export const santixApi = {
  sendToWebhook: (formData: FormData): Promise<any> => {
    return fetchClient(API_CONFIG.SANTIX_WEBHOOK_URL, {
      method: "POST",
      body: formData,
      parseJson: false, // In case webhook returns text or redirect
    });
  },
};
