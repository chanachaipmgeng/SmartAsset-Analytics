from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher as Argon2Hasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.domain.errors import AuthenticationError


class Argon2PasswordHasher:
    def __init__(self) -> None:
        self._hasher = Argon2Hasher()

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._hasher.verify(password_hash, password)
        except (VerificationError, InvalidHashError):
            return False


class JwtTokenService:
    def __init__(self, secret: str, algorithm: str, access_minutes: int, refresh_days: int) -> None:
        self._secret = secret
        self._algorithm = algorithm
        self._access = timedelta(minutes=access_minutes)
        self._refresh = timedelta(days=refresh_days)

    def _issue(self, claims: dict[str, Any], token_type: str, ttl: timedelta) -> str:
        now = datetime.now(UTC)
        payload = {**claims, "type": token_type, "iat": now, "exp": now + ttl}
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def issue_access(self, claims: dict[str, Any]) -> str:
        return self._issue(claims, "access", self._access)

    def issue_refresh(self, claims: dict[str, Any]) -> str:
        return self._issue(claims, "refresh", self._refresh)

    def decode(self, token: str, *, expected_type: str) -> dict[str, Any]:
        try:
            payload = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except jwt.ExpiredSignatureError as exc:
            raise AuthenticationError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่") from exc
        except jwt.PyJWTError as exc:
            raise AuthenticationError("โทเคนไม่ถูกต้อง") from exc
        if payload.get("type") != expected_type:
            raise AuthenticationError("ประเภทโทเคนไม่ถูกต้อง")
        return payload
