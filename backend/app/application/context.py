from dataclasses import dataclass
from uuid import UUID

from app.domain.enums import Role
from app.domain.errors import ValidationError


@dataclass(frozen=True)
class Actor:
    user_id: UUID
    role: Role
    tenant_id: UUID | None

    @property
    def is_superadmin(self) -> bool:
        return self.role == Role.SUPERADMIN

    def resolve_tenant(self, requested: UUID | None) -> UUID:
        """Tenant users are pinned to their own tenant; superadmin must name one."""
        if not self.is_superadmin:
            assert self.tenant_id is not None
            return self.tenant_id
        if requested is None:
            raise ValidationError("กรุณาเลือกกลุ่มลูกค้า")
        return requested
