"""Keyword-based grouping of free-text repair / QC notes into Thai categories."""

from __future__ import annotations

CATEGORY_FIRMWARE = "เฟิร์มแวร์"
CATEGORY_CAMERA = "กล้อง/หน้าจอ"
CATEGORY_POWER = "แหล่งจ่าย/ไฟฟ้า"
CATEGORY_HARDWARE = "ตัวเครื่อง/ฮาร์ดแวร์"
CATEGORY_OTHER = "อื่นๆ"

# First matching category wins; keywords are lowercased for comparison.
_CATEGORIES: list[tuple[str, tuple[str, ...]]] = [
    (
        CATEGORY_FIRMWARE,
        ("เฟิร์มแวร์", "firmware", "ซอฟต์แวร์", "software", "อัปเดต", "update", "fw"),
    ),
    (
        CATEGORY_CAMERA,
        ("กล้อง", "camera", "หน้าจอ", "จอแสดง", "จอภาพ", "screen", "display", "lcd", "oled", "ภาพมืด", "ภาพเบลอ"),
    ),
    (
        CATEGORY_POWER,
        (
            "แหล่งจ่าย",
            "ไฟฟ้า",
            "power",
            "adapter",
            "charger",
            "แบตเตอรี่",
            "แบต",
            "battery",
            "psu",
            "voltage",
            "ไฟตก",
            "ไฟดับ",
            "ไฟไม่",
            "ไม่มีไฟ",
            "สายไฟ",
            "ปลั๊ก",
            "ชาร์จ",
        ),
    ),
    (
        CATEGORY_HARDWARE,
        (
            "ฮาร์ดแวร์",
            "hardware",
            "ตัวเครื่อง",
            "เคส",
            "พอร์ต",
            "port",
            "บอร์ด",
            "board",
            "เซ็นเซอร์",
            "sensor",
            "พัดลม",
            "fan",
            "สาย",
            "cable",
            "แตก",
            "หัก",
            "ชำรุด",
        ),
    ),
]


class KeywordIssueSummarizer:
    """Maps a note to ``{"category": <Thai label>}`` via simple keyword rules."""

    async def summarize(self, issue_text: str) -> dict[str, str]:
        text = (issue_text or "").casefold()
        if not text.strip():
            return {"category": CATEGORY_OTHER}
        for category, keywords in _CATEGORIES:
            if any(k.casefold() in text for k in keywords):
                return {"category": category}
        return {"category": CATEGORY_OTHER}
