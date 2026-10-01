"""Photo files on local disk (a Docker volume in production) and signed links for <img> tags."""

import asyncio
import hashlib
import hmac
import io
import os
import time
from pathlib import Path
from uuid import UUID

from PIL import Image, ImageOps, UnidentifiedImageError

from app.domain.errors import ValidationError
from app.domain.ports import PhotoVariant, StoredImage

ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_PIXELS = 40_000_000
FULL_SIZE = 1600
THUMB_SIZE = 400
LINK_DAY_SECONDS = 86_400

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def _encode(image: Image.Image, size: int, quality: int) -> bytes:
    copy = image.copy()
    copy.thumbnail((size, size), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    copy.save(out, format="WEBP", quality=quality, method=4)
    return out.getvalue()


def _process(data: bytes) -> tuple[bytes, bytes, int, int]:
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.format not in ACCEPTED_FORMATS:
                raise ValidationError("รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WebP")
            if source.width * source.height > MAX_PIXELS:
                raise ValidationError("รูปภาพมีความละเอียดสูงเกินไป")
            # Phone photos store rotation in EXIF; bake it in, and drop EXIF (GPS, device) with the re-encode.
            image = ImageOps.exif_transpose(source)
            image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
            full = _encode(image, FULL_SIZE, 82)
            thumb = _encode(image, THUMB_SIZE, 76)
            width, height = image.size
            scale = min(1.0, FULL_SIZE / max(width, height))
            return full, thumb, max(1, round(width * scale)), max(1, round(height * scale))
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as exc:
        raise ValidationError("ไฟล์รูปภาพไม่ถูกต้องหรือเสียหาย") from exc


def _write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(content)
    os.replace(tmp, path)


class LocalPhotoStorage:
    def __init__(self, root: str | Path, secret: str) -> None:
        self.root = Path(root)
        self._key = hashlib.sha256(b"photo-links:" + secret.encode()).digest()

    def path(self, photo_id: UUID, variant: PhotoVariant) -> Path:
        name = f"{photo_id}_t.webp" if variant == "thumb" else f"{photo_id}.webp"
        return self.root / str(photo_id)[:2] / name

    async def save(self, photo_id: UUID, data: bytes) -> StoredImage:
        full, thumb, width, height = await asyncio.to_thread(_process, data)
        await asyncio.to_thread(_write, self.path(photo_id, "full"), full)
        await asyncio.to_thread(_write, self.path(photo_id, "thumb"), thumb)
        return StoredImage(content_type="image/webp", size_bytes=len(full), width=width, height=height)

    async def delete(self, photo_id: UUID) -> None:
        for variant in ("full", "thumb"):
            await asyncio.to_thread(self.path(photo_id, variant).unlink, missing_ok=True)

    # ---- signed links: <img> can't send the bearer token, so file URLs carry an HMAC instead ----

    def _signature(self, photo_id: UUID, variant: str, expires: int) -> str:
        message = f"{photo_id}.{variant}.{expires}".encode()
        return hmac.new(self._key, message, hashlib.sha256).hexdigest()[:32]

    def signed_query(self, photo_id: UUID, variant: PhotoVariant) -> str:
        # Expiry is bucketed per UTC day so a photo keeps the same URL (and browser cache) for the day.
        expires = (int(time.time()) // LINK_DAY_SECONDS + 2) * LINK_DAY_SECONDS
        return f"v={variant}&exp={expires}&sig={self._signature(photo_id, variant, expires)}"

    def verify(self, photo_id: UUID, variant: str, expires: int, signature: str) -> bool:
        if expires < time.time():
            return False
        return hmac.compare_digest(self._signature(photo_id, variant, expires), signature)


class LocalDocumentStorage:
    """Raw document bytes under MEDIA_ROOT/docs/{id[:2]}/{id}, with HMAC-signed download links."""

    def __init__(self, root: str | Path, secret: str) -> None:
        self.root = Path(root) / "docs"
        self._key = hashlib.sha256(b"doc-links:" + secret.encode()).digest()

    def path(self, document_id: UUID) -> Path:
        return self.root / str(document_id)[:2] / str(document_id)

    async def save(self, document_id: UUID, data: bytes) -> None:
        await asyncio.to_thread(_write, self.path(document_id), data)

    async def delete(self, document_id: UUID) -> None:
        await asyncio.to_thread(self.path(document_id).unlink, missing_ok=True)

    def _signature(self, document_id: UUID, expires: int) -> str:
        message = f"{document_id}.{expires}".encode()
        return hmac.new(self._key, message, hashlib.sha256).hexdigest()[:32]

    def signed_query(self, document_id: UUID) -> str:
        expires = (int(time.time()) // LINK_DAY_SECONDS + 2) * LINK_DAY_SECONDS
        return f"exp={expires}&sig={self._signature(document_id, expires)}"

    def verify(self, document_id: UUID, expires: int, signature: str) -> bool:
        if expires < time.time():
            return False
        return hmac.compare_digest(self._signature(document_id, expires), signature)
