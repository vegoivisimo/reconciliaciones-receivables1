from pydantic import BaseModel
from typing import Optional, List, Any


class InvoiceDetail(BaseModel):
    invoice_number: str
    debtor: str
    due_date: Optional[str] = None
    paid_eur: float
    purchase_price: float
    outstanding_eur: float
    days_overdue: int = 0


class SantixGroup(BaseModel):
    seller: str
    glcs_code: str
    debtor: str
    currency: str
    invoice_count: int
    sum_paid_eur: float
    sum_purchase_price: float
    sum_outstanding_eur: float
    min_purchase_date: Optional[str] = None
    reconciliation_date: Optional[str] = None
    invoices: List[InvoiceDetail]


class LoaniqMatch(BaseModel):
    alias: str
    facility: str
    pricing_option: Optional[str] = None
    status: Optional[str] = None
    ccy: Optional[str] = "EUR"
    current_amount: Optional[float] = None
    original_amount: Optional[float] = None
    host_bank_gross: Optional[float] = None
    effective_date: Optional[str] = None
    maturity_date: Optional[str] = None


class ReconGroup(BaseModel):
    group_key: str
    facility_prefix: str
    tier: str
    reason: str
    delta_eur: float
    delta_pct: float
    new_current_amount: Optional[float] = None
    santix: SantixGroup
    loaniq: Optional[LoaniqMatch] = None
    loaniq_matches: List[LoaniqMatch] = []
    candidates: List[LoaniqMatch] = []


class ReconSummary(BaseModel):
    santix_invoices: int
    santix_groups: int
    loaniq_rows: int
    match_exact: int = 0
    match_cross_prefix: int = 0
    review_overflow: int = 0
    review_debtor_mismatch: int = 0
    suggested: int = 0
    no_match: int = 0
    learned_match: int = 0
    manual_override: int = 0
    total_santix_eur: float
    total_loaniq_eur: float
    stp_rate_pct: float = 0.0


class ReconResponse(BaseModel):
    summary: ReconSummary
    groups: List[ReconGroup]


class ChatMessage(BaseModel):
    role: str
    content: str


class OverrideLogEntry(BaseModel):
    id: int
    group_key: str
    santix_debtor: str
    loaniq_alias: str
    original_tier: str
    operator: str = "operator"
    ts: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    group_context: Optional[Any] = None
