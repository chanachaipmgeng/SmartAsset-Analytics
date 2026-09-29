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
    ON_LOAN = "ON_LOAN"
    UNDER_QC = "UNDER_QC"
    IN_REPAIR = "IN_REPAIR"
    RETIRED = "RETIRED"


class TransactionType(StrEnum):
    CHECK_IN = "CHECK_IN"
    TRANSFER = "TRANSFER"
    CHECK_OUT = "CHECK_OUT"
    INSTALL = "INSTALL"
    RETURN = "RETURN"
    LOAN = "LOAN"
    QC_PASS = "QC_PASS"
    QC_FAIL = "QC_FAIL"
    SEND_REPAIR = "SEND_REPAIR"
    REPAIR_DONE = "REPAIR_DONE"
    RETIRE = "RETIRE"
    # Descriptive fields changed; status stays the same.
    EDIT = "EDIT"


class PhotoOwner(StrEnum):
    DEVICE = "device"
    INSTALLATION = "installation"
    TRANSACTION = "transaction"
    USER = "user"
    DEVICE_MODEL = "device_model"


class AuditEntity(StrEnum):
    TENANT = "tenant"
    USER = "user"
    DEVICE_MODEL = "device_model"
    SUPPLIER = "supplier"
    CUSTOMER = "customer"
    INSTALLATION = "installation"
    PHOTO = "photo"


class AuditAction(StrEnum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    DEACTIVATE = "deactivate"


class ServiceLevel(StrEnum):
    BASIC = "BASIC"
    STANDARD = "STANDARD"
    PREMIUM = "PREMIUM"
