import { API_CONFIG, fetchClient } from "./client";

export interface ReconcileIpResponse {
  summary: any;
  excel_base64?: string;
  data?: any;
}

export interface ReconcileIqAiSummaryResponse {
  summary: string;
}

/**
 * ReconcileIQ Feature API Domain
 */
export const reconcileIqApi = {
  reconcile: (formData: FormData): Promise<ReconcileIpResponse> => {
    return fetchClient(`${API_CONFIG.RECONCILE_BASE_URL}/reconcile`, {
      method: "POST",
      body: formData,
    });
  },
  aiSummary: (payload: { summary: any; data: any }): Promise<ReconcileIqAiSummaryResponse> => {
    return fetchClient(`${API_CONFIG.RECONCILE_BASE_URL}/duco-sap/ai-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};
