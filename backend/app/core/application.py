from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.repositories.management import InMemoryManagementRepository
from app.services.management import ManagementService


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    app = FastAPI(
        title=resolved_settings.app_name,
        version=resolved_settings.app_version,
    )
    app.state.settings = resolved_settings
    app.state.management_service = ManagementService(InMemoryManagementRepository())
    app.include_router(api_router)
    return app
