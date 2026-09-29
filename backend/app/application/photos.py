"""Photos: upload, list and delete images attached to records.

Devices, installations and transactions may have several photos; users (avatar) and device models have one,
so a new upload replaces the old image.
"""

from uuid import UUID, uuid4

from app.application.context import Actor
from app.domain.entities import Photo
from app.domain.enums import PhotoOwner
from app.domain.errors import NotFoundError, PermissionDeniedError, ValidationError
from app.domain.ports import PhotoStorage, UnitOfWork
from app.domain.rules import require_admin, require_superadmin, require_write

MAX_PHOTOS_PER_OWNER = 20
MAX_CAPTION_LENGTH = 200
SINGLE_PHOTO_OWNERS = {PhotoOwner.USER, PhotoOwner.DEVICE_MODEL}


async def _owner_tenant(uow: UnitOfWork, actor: Actor, owner_type: PhotoOwner, owner_id: UUID) -> UUID | None:
    """Checks the caller may change the owner's photos and returns the tenant the photos belong to.

    RLS already hides owners from other tenants, so an invisible owner reads as not found.
    """
    match owner_type:
        case PhotoOwner.DEVICE:
            require_write(actor.role)
            device = await uow.devices.get(owner_id)
            if device is None:
                raise NotFoundError("ไม่พบอุปกรณ์")
            return device.tenant_id
        case PhotoOwner.INSTALLATION:
            require_write(actor.role)
            installation = await uow.installations.get(owner_id)
            if installation is None:
                raise NotFoundError("ไม่พบจุดติดตั้ง")
            return installation.tenant_id
        case PhotoOwner.TRANSACTION:
            require_write(actor.role)
            tx = await uow.transactions.get(owner_id)
            if tx is None:
                raise NotFoundError("ไม่พบรายการเคลื่อนไหว")
            return tx.tenant_id
        case PhotoOwner.USER:
            if owner_id != actor.user_id:
                require_admin(actor.role)
            user = await uow.users.get(owner_id)
            if user is None:
                raise NotFoundError("ไม่พบผู้ใช้")
            if not actor.is_superadmin and user.tenant_id != actor.tenant_id:
                raise PermissionDeniedError("จัดการได้เฉพาะผู้ใช้ในกลุ่มลูกค้าของตนเอง")
            return user.tenant_id
        case PhotoOwner.DEVICE_MODEL:
            require_superadmin(actor.role)
            if await uow.device_models.get(owner_id) is None:
                raise NotFoundError("ไม่พบรุ่นอุปกรณ์")
            return None


async def list_photos(
    uow: UnitOfWork, actor: Actor, owner_type: PhotoOwner, owner_ids: list[UUID] | None = None
) -> list[Photo]:
    return await uow.photos.list(owner_type, owner_ids)


async def upload_photo(
    uow: UnitOfWork,
    storage: PhotoStorage,
    actor: Actor,
    *,
    owner_type: PhotoOwner,
    owner_id: UUID,
    data: bytes,
    caption: str | None = None,
) -> Photo:
    tenant_id = await _owner_tenant(uow, actor, owner_type, owner_id)
    caption = (caption or "").strip() or None
    if caption and len(caption) > MAX_CAPTION_LENGTH:
        raise ValidationError(f"คำอธิบายรูปต้องไม่เกิน {MAX_CAPTION_LENGTH} ตัวอักษร")

    replaced: list[Photo] = []
    if owner_type in SINGLE_PHOTO_OWNERS:
        replaced = await uow.photos.list(owner_type, [owner_id])
    elif await uow.photos.count(owner_type, owner_id) >= MAX_PHOTOS_PER_OWNER:
        raise ValidationError(f"แนบรูปได้สูงสุด {MAX_PHOTOS_PER_OWNER} รูปต่อรายการ")

    photo_id = uuid4()
    stored = await storage.save(photo_id, data)
    photo = Photo(
        id=photo_id,
        owner_type=owner_type,
        owner_id=owner_id,
        tenant_id=tenant_id,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        width=stored.width,
        height=stored.height,
        caption=caption,
        uploaded_by=actor.user_id,
    )
    try:
        for old in replaced:
            await uow.photos.delete(old.id)
        await uow.photos.add(photo)
        await uow.flush()
    except Exception:
        await storage.delete(photo_id)
        raise
    for old in replaced:
        await storage.delete(old.id)
    return photo


async def delete_photo(uow: UnitOfWork, storage: PhotoStorage, actor: Actor, photo_id: UUID) -> None:
    photo = await uow.photos.get(photo_id)
    if photo is None:
        raise NotFoundError("ไม่พบรูปภาพ")
    await _owner_tenant(uow, actor, photo.owner_type, photo.owner_id)
    await uow.photos.delete(photo_id)
    await uow.flush()
    await storage.delete(photo_id)


async def delete_owner_photos(uow: UnitOfWork, storage: PhotoStorage, owner_type: PhotoOwner, owner_id: UUID) -> None:
    """Removes every photo of a record that is itself being deleted (the caller has checked permissions)."""
    photos = await uow.photos.list(owner_type, [owner_id])
    for photo in photos:
        await uow.photos.delete(photo.id)
    await uow.flush()
    for photo in photos:
        await storage.delete(photo.id)
