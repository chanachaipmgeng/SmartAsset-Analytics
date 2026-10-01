"""Non-photo document attachments (PDF / DOCX / XLSX) for devices, customers and repair orders."""

from uuid import UUID, uuid4

from app.application import audit
from app.application.context import Actor
from app.domain.entities import Document
from app.domain.enums import AuditEntity, DocumentOwner
from app.domain.errors import NotFoundError, ValidationError
from app.domain.ports import DocumentStorage, UnitOfWork
from app.domain.rules import require_write

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_CAPTION_LENGTH = 200
MAX_DOCUMENTS_PER_OWNER = 50

ALLOWED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}


async def _owner_tenant(uow: UnitOfWork, actor: Actor, owner_type: DocumentOwner, owner_id: UUID) -> UUID | None:
    """Checks the caller may change the owner's documents and returns the tenant they belong to."""
    require_write(actor.role)
    match owner_type:
        case DocumentOwner.DEVICE:
            device = await uow.devices.get(owner_id)
            if device is None:
                raise NotFoundError("ไม่พบอุปกรณ์")
            return device.tenant_id
        case DocumentOwner.CUSTOMER:
            customer = await uow.customers.get(owner_id)
            if customer is None:
                raise NotFoundError("ไม่พบลูกค้า")
            return customer.tenant_id
        case DocumentOwner.REPAIR_ORDER:
            order = await uow.repair_orders.get(owner_id)
            if order is None:
                raise NotFoundError("ไม่พบใบงานซ่อม")
            return order.tenant_id


def _validate_upload(file_name: str, content_type: str | None, data: bytes) -> str:
    if len(data) == 0:
        raise ValidationError("ไฟล์ว่างเปล่า")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise ValidationError("ไฟล์เอกสารต้องมีขนาดไม่เกิน 10 MB")
    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype not in ALLOWED_CONTENT_TYPES:
        lower = file_name.lower()
        if lower.endswith(".pdf"):
            ctype = "application/pdf"
        elif lower.endswith(".docx"):
            ctype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif lower.endswith(".xlsx"):
            ctype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            raise ValidationError("รองรับเฉพาะไฟล์ PDF, DOCX หรือ XLSX")
    return ctype


async def list_documents(
    uow: UnitOfWork, actor: Actor, owner_type: DocumentOwner, owner_ids: list[UUID] | None = None
) -> list[Document]:
    return await uow.documents.list(owner_type, owner_ids)


async def upload_document(
    uow: UnitOfWork,
    storage: DocumentStorage,
    actor: Actor,
    *,
    owner_type: DocumentOwner,
    owner_id: UUID,
    file_name: str,
    content_type: str | None,
    data: bytes,
    caption: str | None = None,
) -> Document:
    tenant_id = await _owner_tenant(uow, actor, owner_type, owner_id)
    file_name = (file_name or "").strip() or "document"
    if len(file_name) > 255:
        file_name = file_name[:255]
    caption = (caption or "").strip() or None
    if caption and len(caption) > MAX_CAPTION_LENGTH:
        raise ValidationError(f"คำอธิบายต้องไม่เกิน {MAX_CAPTION_LENGTH} ตัวอักษร")

    existing = await uow.documents.list(owner_type, [owner_id])
    if len(existing) >= MAX_DOCUMENTS_PER_OWNER:
        raise ValidationError(f"แนบเอกสารได้สูงสุด {MAX_DOCUMENTS_PER_OWNER} ไฟล์ต่อรายการ")

    resolved_type = _validate_upload(file_name, content_type, data)
    document_id = uuid4()
    document = Document(
        id=document_id,
        owner_type=owner_type,
        owner_id=owner_id,
        tenant_id=tenant_id,
        file_name=file_name,
        content_type=resolved_type,
        size_bytes=len(data),
        caption=caption,
        uploaded_by=actor.user_id,
    )
    await storage.save(document_id, data)
    try:
        await uow.documents.add(document)
        await uow.flush()
        await audit.record(
            uow,
            actor,
            AuditEntity.DOCUMENT,
            document.id,
            tenant_id=tenant_id,
            label=file_name,
            after=document,
        )
    except Exception:
        await storage.delete(document_id)
        raise
    return document


async def delete_document(uow: UnitOfWork, storage: DocumentStorage, actor: Actor, document_id: UUID) -> None:
    document = await uow.documents.get(document_id)
    if document is None:
        raise NotFoundError("ไม่พบเอกสาร")
    await _owner_tenant(uow, actor, document.owner_type, document.owner_id)
    await uow.documents.delete(document_id)
    await uow.flush()
    await audit.record(
        uow,
        actor,
        AuditEntity.DOCUMENT,
        document.id,
        tenant_id=document.tenant_id,
        label=document.file_name,
        before=document,
    )
    await storage.delete(document_id)


async def get_document(uow: UnitOfWork, actor: Actor, document_id: UUID) -> Document:
    document = await uow.documents.get(document_id)
    if document is None:
        raise NotFoundError("ไม่พบเอกสาร")
    return document
