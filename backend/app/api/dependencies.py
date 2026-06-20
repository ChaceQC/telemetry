from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.repositories.management import SqlAlchemyManagementRepository
from app.services.management import ManagementService


def get_db_session(request: Request) -> Iterator[Session]:
    session_factory = request.app.state.db_session_factory
    with session_factory() as session:
        yield session


def get_management_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ManagementService:
    return ManagementService(SqlAlchemyManagementRepository(session))
