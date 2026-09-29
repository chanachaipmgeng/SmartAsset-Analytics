class DomainError(Exception):
    """Base error; `message` is user-facing Thai text."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    pass


class ConflictError(DomainError):
    pass


class PermissionDeniedError(DomainError):
    pass


class AuthenticationError(DomainError):
    pass


class InvalidTransitionError(DomainError):
    pass


class ValidationError(DomainError):
    pass
