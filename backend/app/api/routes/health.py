from fastapi import APIRouter, Request

from app.core.config import Settings
from app.schemas.health import HealthCheckResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthCheckResponse, summary="后端健康检查")
def health_check(request: Request) -> HealthCheckResponse:
    settings: Settings = request.app.state.settings
    return HealthCheckResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        port=settings.port,
    )
