from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.repositories.management import SqlAlchemyManagementRepository
from app.services.auth import AuthConfigurationError, AuthenticationError, AuthService
from app.services.management import ManagementService

bearer_scheme = HTTPBearer(auto_error=False)


def get_db_session(request: Request) -> Iterator[Session]:
    session_factory = request.app.state.db_session_factory
    with session_factory() as session:
        yield session


def get_management_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ManagementService:
    return ManagementService(SqlAlchemyManagementRepository(session))


def get_auth_service(
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
) -> AuthService:
    return AuthService(SqlAlchemyAuthRepository(session), request.app.state.settings)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserRecord:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少访问令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return auth_service.get_user_from_token(credentials.credentials)
    except AuthConfigurationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="认证服务未配置",
        ) from error
    except AuthenticationError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
            headers={"WWW-Authenticate": "Bearer"},
        ) from error
