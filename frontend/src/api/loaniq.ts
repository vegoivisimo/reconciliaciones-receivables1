import { API_CONFIG, fetchClient } from "./client";

// Request/Response types matching LoaniqPage models
export interface LoaniqReconcileResponse {
  summary: any;
  groups: any[];
  loaniq_updated?: Record<string, unknown>[];
}

export interface LoaniqAiSummaryPayload {
  summary: any;
  groups: any[];
}

export interface LoaniqAiSummaryResponse {
  summary?: string;
}

export interface LoaniqOverrideLogEntry {
  id: number;
  group_key: string;
  santix_debtor: string;
  original_tier: string;
  loaniq_alias: string;
  operator: string;
  ts: string;
}

export interface LoaniqOverridePayload {
  group_key: string;
  loaniq_alias: string;
  santix_debtor: string;
  sum_paid: number;
  original_tier: string;
}





/**
 * Loaniq Feature API Domain
 */
export const loaniqApi = {
  reconcile: (formData: FormData): Promise<LoaniqReconcileResponse> => {
    return fetchClient(`${API_CONFIG.LOANIQ_BASE_URL}/api/loaniq/reconcile`, {
      method: "POST",
      body: formData,
    });
  },

  aiSummary: (payload: LoaniqAiSummaryPayload): Promise<LoaniqAiSummaryResponse> => {
    return fetchClient(`${API_CONFIG.LOANIQ_BASE_URL}/api/loaniq/ai-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  getOverrides: (): Promise<LoaniqOverrideLogEntry[]> => {
    return fetchClient(`${API_CONFIG.LOANIQ_BASE_URL}/api/loaniq/overrides`);
  },

  applyOverride: (payload: LoaniqOverridePayload): Promise<void> => {
    return fetchClient(`${API_CONFIG.LOANIQ_BASE_URL}/api/loaniq/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },


};
