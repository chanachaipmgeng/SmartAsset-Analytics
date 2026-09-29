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


class BulkActionError(ValidationError):
    """A bulk movement was rejected as a whole; `failures` lists each device and why it could not move."""

    def __init__(self, message: str, failures: list[dict[str, str]]) -> None:
        super().__init__(message)
        self.failures = failures
