from enum import StrEnum


class Role(StrEnum):
    SUPERADMIN = "superadmin"
    TENANT_ADMIN = "tenant_admin"
    STAFF = "staff"
    VIEWER = "viewer"


class DeviceStatus(StrEnum):
    IN_STOCK = "IN_STOCK"
    CHECKED_OUT = "CHECKED_OUT"
    INSTALLED = "INSTALLED"
    RETIRED = "RETIRED"


class TransactionType(StrEnum):
    CHECK_IN = "CHECK_IN"
    TRANSFER = "TRANSFER"
    CHECK_OUT = "CHECK_OUT"
    INSTALL = "INSTALL"
    RETURN = "RETURN"
    RETIRE = "RETIRE"


class ServiceLevel(StrEnum):
    BASIC = "BASIC"
    STANDARD = "STANDARD"
    PREMIUM = "PREMIUM"
