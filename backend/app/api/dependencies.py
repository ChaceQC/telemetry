from fastapi import Request

from app.services.management import ManagementService


def get_management_service(request: Request) -> ManagementService:
    return request.app.state.management_service
