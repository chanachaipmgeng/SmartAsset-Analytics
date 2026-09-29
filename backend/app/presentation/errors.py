from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.domain.errors import (
    AuthenticationError,
    BulkActionError,
    ConflictError,
    DomainError,
    InvalidTransitionError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    AuthenticationError: 401,
    PermissionDeniedError: 403,
    NotFoundError: 404,
    ConflictError: 409,
    InvalidTransitionError: 409,
    ValidationError: 422,
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError) -> JSONResponse:
        status = next((code for cls, code in STATUS_BY_ERROR.items() if isinstance(exc, cls)), 400)
        headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
        body: dict[str, object] = {"detail": exc.message}
        if isinstance(exc, BulkActionError):
            body["failures"] = exc.failures
        return JSONResponse(body, status_code=status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [".".join(str(p) for p in e["loc"] if p != "body") for e in exc.errors()]
        return JSONResponse(
            jsonable_encoder(
                {"detail": f"ข้อมูลไม่ถูกต้อง: {', '.join(f for f in fields if f)}", "errors": exc.errors()}
            ),
            status_code=422,
        )
