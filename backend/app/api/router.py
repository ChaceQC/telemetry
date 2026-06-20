from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.management import router as management_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(management_router)
