from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load backend/.env before importing routers that read OPENAI_API_KEY at import-time.
load_dotenv(Path(__file__).with_name(".env"))

from duco_dataset_router import router as duco_router
from loaniq_router import router as loaniq_router
from reconcile_router import router as reconcile_router


app = FastAPI(title="API de Reconciliacion Financiera", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reconcile_router)
app.include_router(duco_router)
app.include_router(loaniq_router)
