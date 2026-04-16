try:
    from main import app
except ImportError:
    from .main import app

try:
    from duco_erp_v3 import ReconciliadorService, df_to_records
    from reconcile_router import upload_files
except ImportError:
    from .duco_erp_v3 import ReconciliadorService, df_to_records
    from .reconcile_router import upload_files
