import { API_CONFIG, fetchClient } from "./client";

export interface DucoFilterPayload {
  datasetId: string;
  filters: any[];
  page: number;
  pageSize: number;
}

export interface DucoFilterResponse {
  rows: any[];
}

export interface DucoDatasetPayload {
  fileName: string;
  rows: any[];
  fields: any[];
}

export interface DucoDatasetResponse {
  datasetId: string;
}

export interface DucoAiRulePayload {
  datasetId: string;
  prompt: string;
}

export interface DucoAiRuleResponse {
  fieldKey: string;
  operator: "contains" | "equals" | "greaterThan" | "lessThan" | "between" | "before" | "after";
  value?: string;
  valueTo?: string;
  note?: string;
  confidence?: number;
  model?: string;
}

/**
 * Duco Feature API Domain
 */
export const ducoApi = {
  filter: (payload: DucoFilterPayload): Promise<DucoFilterResponse> => {
    return fetchClient(`${API_CONFIG.DUCO_BASE_URL}/api/duco/filter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  createDataset: (payload: DucoDatasetPayload): Promise<DucoDatasetResponse> => {
    return fetchClient(`${API_CONFIG.DUCO_BASE_URL}/api/duco/datasets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  interpretAIRule: (payload: DucoAiRulePayload): Promise<DucoAiRuleResponse> => {
    return fetchClient(`${API_CONFIG.DUCO_BASE_URL}/api/duco/ai-rule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};
