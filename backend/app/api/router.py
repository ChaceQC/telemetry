from fastapi import APIRouter

from app.api.routes.api_keys import router as api_keys_router
from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.ingest import router as ingest_router
from app.api.routes.management import router as management_router
from app.api.routes.query import router as query_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(management_router)
api_router.include_router(api_keys_router)
api_router.include_router(ingest_router)
api_router.include_router(query_router)
