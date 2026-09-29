"""Rich demo data on top of the seed: two tenants with customers, every role, about 70 devices in every status,
90 days of backdated history and generated photos.

Run (API container): python -m app.infrastructure.demo_data
Idempotent: a second run finds the demo warehouse user and stops. Random choices use a fixed seed, so every
fresh database gets the same data. Uses the owner connection like the seed; the application services still
enforce the state machine, so every status change has its transaction row.
"""

import asyncio
import random
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.application import admin, customers, inventory, photos
from app.application.context import Actor
from app.application.dashboard import BUSINESS_OFFSET
from app.core.config import get_settings
from app.domain.entities import Customer, DeviceModel, Supplier, Tenant, User
from app.domain.enums import DeviceStatus, PhotoOwner, Role, ServiceLevel
from app.infrastructure import demo_images
from app.infrastructure.db.repositories import SqlUnitOfWork
from app.infrastructure.db.session import Database
from app.infrastructure.media import LocalPhotoStorage
from app.infrastructure.security import Argon2PasswordHasher
from app.infrastructure.seed import seed

RANDOM_SEED = 20260929
HISTORY_DAYS = 90
MARKER_EMAIL = "warehouse@example.com"

MODELS = [
    ("ZKTeco", "SpeedFace-V5L", "สแกนใบหน้า", "6.60", "ZK-V5L", Decimal("12500")),
    ("ZKTeco", "MB460", "สแกนลายนิ้วมือ", "6.4.1", "ZK-MB460", Decimal("6900")),
    ("Hikvision", "DS-K1T341", "สแกนใบหน้า", "3.2", "HIK-341", Decimal("8900")),
    ("ZKTeco", "ProFace X", "สแกนใบหน้า + บัตร", "7.1.2", "ZK-PFX", Decimal("21500")),
    ("Hikvision", "DS-K1T671M", "สแกนใบหน้า + วัดอุณหภูมิ", "3.5.1", "HIK-671", Decimal("15800")),
    ("Suprema", "BioStation 3", "สแกนใบหน้า + QR", "1.2.0", "SUP-BS3", Decimal("27900")),
]

SUPPLIERS = [
    ("ศูนย์บริการ ZKTeco ประเทศไทย", "แผนกซ่อม", "02-000-0100", "service@zkteco.example", None),
    ("บริษัท ไฮค์วิชั่น (ประเทศไทย) จำกัด", "คุณวิภา", "02-000-0200", "rma@hikvision.example", "รับเคลมในประกัน"),
    ("ห้างหุ้นส่วน ช่างดีเซอร์วิส", "คุณประเสริฐ", "081-000-0300", None, "ซ่อมนอกประกัน ราคาเหมา"),
    ("บริษัท ซีเคียวริตี้ ดิสทริบิวชั่น จำกัด", "ฝ่ายขาย", "02-000-0400", "sales@secdist.example", "ตัวแทนจำหน่าย Suprema"),
]

# (code, name, [(company, contact, phone, level, address, [(lat, lng, site address, site contact, site phone)])])
TENANTS: list[tuple[str, str, list[tuple[str, str, str, ServiceLevel, str, list[tuple[float, float, str, str, str]]]]]] = [
    (
        "TIMETECH",
        "บริษัท ไทมเทค โซลูชั่น จำกัด",
        [
            ("โรงงานบางนาอุตสาหกรรม", "คุณสมชาย", "02-000-0001", ServiceLevel.PREMIUM, "ถนนบางนา-ตราด กรุงเทพมหานคร", [
                (13.6680, 100.6045, "ประตูหน้าโรงงาน ถนนบางนา-ตราด กม.3", "รปภ. ป้อมหน้า", "02-000-0011"),
                (13.6702, 100.6101, "อาคารสำนักงาน ชั้น 1 บางนา", "คุณสมชาย", "02-000-0001"),
            ]),
            ("โรงแรมเชียงใหม่ริเวอร์", "คุณสมหญิง", "053-000-002", ServiceLevel.STANDARD, "ถนนเจริญประเทศ เชียงใหม่", [
                (18.7883, 98.9853, "ล็อบบี้พนักงาน ถนนเจริญประเทศ", "ฝ่ายบุคคล", "053-000-012"),
            ]),
            ("ห้างสรรพสินค้าพระราม 9 พลาซ่า", "คุณอนันต์", "02-000-0003", ServiceLevel.PREMIUM, "ถนนพระราม 9 กรุงเทพมหานคร", [
                (13.7577, 100.5650, "ทางเข้าพนักงาน ชั้น B1", "คุณอนันต์", "02-000-0003"),
                (13.7583, 100.5662, "ห้องควบคุม ชั้น 6", "ฝ่ายอาคาร", "02-000-0013"),
            ]),
            ("โรงพยาบาลนนทเวช", "คุณพรทิพย์", "02-000-0004", ServiceLevel.PREMIUM, "ถนนงามวงศ์วาน นนทบุรี", [
                (13.8566, 100.5250, "ตึกผู้ป่วยนอก ประตูพนักงาน", "คุณพรทิพย์", "02-000-0004"),
            ]),
            ("บริษัท ขนส่งด่วนลาดกระบัง จำกัด", "คุณวีระ", "02-000-0005", ServiceLevel.BASIC, "นิคมลาดกระบัง กรุงเทพมหานคร", [
                (13.7270, 100.7700, "คลังสินค้า A ประตู 2", "หัวหน้ากะ", "089-000-0005"),
            ]),
            ("วิทยาลัยเทคนิคชลบุรี", "อาจารย์สุนทร", "038-000-006", ServiceLevel.STANDARD, "ถนนสุขุมวิท ชลบุรี", [
                (13.3611, 100.9847, "อาคารอำนวยการ", "งานบุคลากร", "038-000-016"),
            ]),
        ],
    ),
    (
        "SIAMSVC",
        "บริษัท สยามเซอร์วิส จำกัด",
        [
            ("ศูนย์กระจายสินค้าวังน้อย", "คุณธนากร", "035-000-101", ServiceLevel.PREMIUM, "อำเภอวังน้อย พระนครศรีอยุธยา", [
                (14.2280, 100.7300, "อาคารคลัง 1 ประตูพนักงาน", "คุณธนากร", "035-000-101"),
                (14.2295, 100.7322, "อาคารคลัง 2 ทางเข้าหลัก", "รปภ.", "035-000-111"),
            ]),
            ("โรงแรมภูเก็ตบีชรีสอร์ท", "คุณมาลี", "076-000-102", ServiceLevel.STANDARD, "หาดป่าตอง ภูเก็ต", [
                (7.8961, 98.2966, "ฝั่งพนักงาน หลังครัว", "คุณมาลี", "076-000-102"),
            ]),
            ("บริษัท ขอนแก่นฟู้ดส์ จำกัด", "คุณชัยวัฒน์", "043-000-103", ServiceLevel.BASIC, "ถนนมิตรภาพ ขอนแก่น", [
                (16.4419, 102.8360, "ไลน์ผลิต ประตู 1", "หัวหน้าไลน์", "043-000-113"),
            ]),
            ("มหาวิทยาลัยหาดใหญ่", "คุณนิตยา", "074-000-104", ServiceLevel.STANDARD, "อำเภอหาดใหญ่ สงขลา", [
                (7.0086, 100.4747, "อาคารบริหาร ชั้น 1", "คุณนิตยา", "074-000-104"),
            ]),
            ("สำนักงานใหญ่ สยามเซอร์วิส", "คุณกิตติ", "02-000-0105", ServiceLevel.PREMIUM, "ถนนสาทร กรุงเทพมหานคร", []),
        ],
    ),
]

# (tenant code or None for superadmin, role, email, name)
USERS = [
    (None, Role.SUPERADMIN, MARKER_EMAIL, "เจ้าหน้าที่คลังกลาง"),
    ("TIMETECH", Role.STAFF, "staff.timetech@example.com", "ช่างสมปอง ไทมเทค"),
    ("TIMETECH", Role.STAFF, "tech.timetech@example.com", "ช่างณัฐพล ไทมเทค"),
    ("TIMETECH", Role.VIEWER, "viewer.timetech@example.com", "ผู้ตรวจสอบ ไทมเทค"),
    ("SIAMSVC", Role.TENANT_ADMIN, "admin.siamsvc@example.com", "ผู้ดูแล สยามเซอร์วิส"),
    ("SIAMSVC", Role.STAFF, "staff.siamsvc@example.com", "ช่างอำนาจ สยามเซอร์วิส"),
    ("SIAMSVC", Role.VIEWER, "viewer.siamsvc@example.com", "ผู้บริหาร สยามเซอร์วิส"),
]

# Final status mix per owner; the history before it is random (earlier install / loan / repair cycles).
MIX: dict[str | None, dict[DeviceStatus, int]] = {
    "TIMETECH": {
        DeviceStatus.INSTALLED: 12,
        DeviceStatus.IN_STOCK: 6,
        DeviceStatus.CHECKED_OUT: 3,
        DeviceStatus.ON_LOAN: 3,
        DeviceStatus.UNDER_QC: 3,
        DeviceStatus.IN_REPAIR: 3,
        DeviceStatus.RETIRED: 2,
    },
    "SIAMSVC": {
        DeviceStatus.INSTALLED: 8,
        DeviceStatus.IN_STOCK: 5,
        DeviceStatus.CHECKED_OUT: 3,
        DeviceStatus.ON_LOAN: 2,
        DeviceStatus.UNDER_QC: 2,
        DeviceStatus.IN_REPAIR: 3,
        DeviceStatus.RETIRED: 2,
    },
    None: {DeviceStatus.IN_STOCK: 8, DeviceStatus.IN_REPAIR: 1, DeviceStatus.RETIRED: 1},
}

CYCLES = [
    ["check_out", "install", "return", "qc_pass"],
    ["check_out", "install", "send_repair", "repair_done"],
    ["loan", "return", "qc_pass"],
    ["send_repair", "repair_done"],
    ["check_out", "return", "qc_fail", "repair_done"],
]

TAILS: dict[DeviceStatus, list[list[str]]] = {
    DeviceStatus.IN_STOCK: [[]],
    DeviceStatus.CHECKED_OUT: [["check_out"]],
    DeviceStatus.INSTALLED: [["check_out", "install"]],
    DeviceStatus.ON_LOAN: [["loan"]],
    DeviceStatus.UNDER_QC: [["check_out", "install", "return"], ["loan", "return"], ["check_out", "return"]],
    DeviceStatus.IN_REPAIR: [["send_repair"], ["check_out", "install", "send_repair"], ["check_out", "install", "return", "qc_fail"]],
    DeviceStatus.RETIRED: [["retire"], ["send_repair", "retire"], ["check_out", "install", "return", "retire"]],
}

NOTES = {
    "transfer": ["ส่งมอบตามใบสั่งซื้อ", "โอนเข้าคลังลูกค้า", "เติมสต็อกประจำเดือน"],
    "check_out": ["ช่างเบิกไปติดตั้ง", "เบิกเพื่อติดตั้งหน้างาน", "เบิกไปเปลี่ยนเครื่องเดิม"],
    "return": ["รับคืนจากหน้างาน", "ลูกค้ายกเลิกสัญญา", "ย้ายจุดติดตั้ง รับเครื่องกลับ", "ครบกำหนดยืม"],
    "qc_pass": ["ทดสอบสแกนผ่าน อัปเดตเฟิร์มแวร์แล้ว", "ตรวจสภาพ ใช้งานได้ปกติ", "ทำความสะอาดและทดสอบแล้ว"],
    "qc_fail": ["หน้าจอสัมผัสไม่ตอบสนอง", "สแกนใบหน้าไม่ติด", "เปิดไม่ติด ไฟไม่เข้า"],
    "send_repair": ["จอแตกจากการกระแทก", "เซนเซอร์ลายนิ้วมืออ่านไม่ได้", "บอร์ดเสียหลังไฟกระชาก", "เครือข่ายหลุดบ่อย"],
    "repair_done": ["เปลี่ยนจอใหม่ QC ผ่าน", "เปลี่ยนเซนเซอร์ ทดสอบ 50 ครั้งผ่าน", "เปลี่ยนบอร์ดจ่ายไฟ QC ผ่าน"],
    "retire": ["ซ่อมไม่คุ้ม ตัดจำหน่าย", "รุ่นเก่า เลิกใช้งาน", "เสียหายจากน้ำท่วม"],
    "loan": ["ให้ลูกค้าทดลองใช้", "เครื่องสำรองระหว่างซ่อม", "ยืมไปงานสาธิต"],
}

PHOTO_CAPTIONS = {
    "return": "สภาพเครื่องตอนรับคืน",
    "send_repair": "อาการเสียก่อนส่งซ่อม",
    "qc_fail": "จุดที่ไม่ผ่าน QC",
    "repair_done": "หลังซ่อมเสร็จ",
}


@dataclass
class Step:
    kind: str
    at: datetime
    arg: Any = None


@dataclass
class Plan:
    owner: str | None
    target: DeviceStatus
    model: int
    steps: list[Step] = field(default_factory=list)
    site: int | None = None
    warranty_days: int | None = None
    loan_due: date | None = None


def _moment(days_ago: float, now: datetime) -> datetime:
    """Maps a fractional day offset to a working-hours time (08:30-17:30 Bangkok), monotonic in `days_ago`."""
    day = int(days_ago)
    frac = days_ago - day
    local_day = now.astimezone(BUSINESS_OFFSET).date() - timedelta(days=day)
    minutes = 17 * 60 + 30 - round(frac * 9 * 60)
    return datetime.combine(local_day, time(minutes // 60, minutes % 60), tzinfo=BUSINESS_OFFSET)


def build_plans(rng: random.Random, now: datetime) -> list[Plan]:
    plans: list[Plan] = []
    for owner, mix in MIX.items():
        for target, count in mix.items():
            for i in range(count):
                plan = Plan(owner=owner, target=target, model=rng.randrange(len(MODELS)))
                kinds: list[str] = []
                if owner is None:
                    kinds.append("check_in_central")
                elif rng.random() < 0.6:
                    kinds += ["check_in_central", "transfer"]
                else:
                    kinds.append("check_in_tenant")
                arrived = len(kinds)
                if owner is not None and rng.random() < 0.4:
                    kinds += rng.choice(CYCLES)
                if owner is None and target == DeviceStatus.IN_REPAIR:
                    kinds.append("send_repair")
                elif owner is None and target == DeviceStatus.RETIRED:
                    kinds += ["send_repair", "retire"]
                elif owner is not None:
                    kinds += rng.choice(TAILS[target])
                if rng.random() < 0.3:
                    kinds.insert(rng.randint(arrived, len(kinds)), "edit")

                start = rng.uniform(HISTORY_DAYS - 20, HISTORY_DAYS)
                end = rng.uniform(1.05, 6)
                if target == DeviceStatus.IN_REPAIR and i == 0:
                    end = rng.uniform(16, 30)  # stuck in repair: shows in the "repair over 14 days" alert
                if target == DeviceStatus.INSTALLED:
                    end = rng.uniform(3, 45)
                points = sorted((rng.uniform(end, start) for _ in kinds[1:]), reverse=True)
                offsets = [start, *points[:-1], end] if len(kinds) > 1 else [start]
                plan.steps = [Step(kind, _moment(off, now)) for kind, off in zip(kinds, offsets, strict=True)]

                if target == DeviceStatus.ON_LOAN:
                    today = now.astimezone(BUSINESS_OFFSET).date()
                    plan.loan_due = today - timedelta(days=4) if i == 0 else today + timedelta(days=rng.randint(2, 21))
                plans.append(plan)
    # A handful of warranties ending within 30 days, a few already expired.
    for index, plan in enumerate(rng.sample(plans, 9)):
        plan.warranty_days = rng.randint(3, 28) if index < 6 else -rng.randint(5, 60)
    return plans


class DemoLoader:
    def __init__(self, session: AsyncSession, storage: LocalPhotoStorage, rng: random.Random, password: str) -> None:
        self.session = session
        self.uow = SqlUnitOfWork(session)
        self.storage = storage
        self.rng = rng
        self.password = password
        self.hasher = Argon2PasswordHasher()
        self.now = datetime.now(UTC)
        self.photo_times: list[tuple[UUID, datetime]] = []
        self.serial_counter: dict[str, int] = {}
        self.tag_counter: dict[str, int] = {}

    async def photo(self, owner: PhotoOwner, owner_id: UUID, data: bytes, actor: Actor, caption: str | None,
                    at: datetime | None = None) -> None:
        photo = await photos.upload_photo(
            self.uow, self.storage, actor, owner_type=owner, owner_id=owner_id, data=data, caption=caption
        )
        if at is not None:
            self.photo_times.append((photo.id, at))

    # ---- reference data ----

    async def tenants(self, su: Actor) -> dict[str, Tenant]:
        result: dict[str, Tenant] = {}
        for code, name, _ in TENANTS:
            tenant = await self.uow.tenants.get_by_code(code)
            result[code] = tenant or await admin.create_tenant(self.uow, su, name=name, code=code)
        return result

    async def users(self, su: Actor, tenants: dict[str, Tenant]) -> dict[str, list[Actor]]:
        """Actors by tenant code ('' for central); tenant admins from the seed are reused."""
        actors: dict[str, list[Actor]] = {"": [su]}
        for tenant_code, role, email, name in USERS:
            tenant_id = tenants[tenant_code].id if tenant_code else None
            user = await self.uow.users.get_by_email(email) or await admin.create_user(
                self.uow, self.hasher, su, email=email, full_name=name, role=role, password=self.password,
                tenant_id=tenant_id,
            )
            if role != Role.VIEWER:
                actors.setdefault(tenant_code or "", []).append(Actor(user.id, role, tenant_id))
        for user in await self.uow.users.list():
            if user.role == Role.TENANT_ADMIN and user.tenant_id == tenants["TIMETECH"].id:
                actors.setdefault("TIMETECH", []).append(Actor(user.id, user.role, user.tenant_id))
        for index, user in enumerate(await self.uow.users.list()):
            initials = "".join(part[0] for part in user.email.split("@")[0].split(".")[:2])
            await self.photo(PhotoOwner.USER, user.id, demo_images.avatar(initials, RANDOM_SEED + index), su, None)
        return actors

    async def models(self, su: Actor) -> list[DeviceModel]:
        existing = {(m.brand, m.name): m for m in await self.uow.device_models.list()}
        result = []
        for index, (brand, name, kind, firmware, _, _) in enumerate(MODELS):
            model = existing.get((brand, name)) or await admin.create_device_model(
                self.uow, su, brand=brand, name=name, device_type=kind, firmware_version=firmware
            )
            await self.photo(PhotoOwner.DEVICE_MODEL, model.id, demo_images.model_image(brand, name, index), su, None)
            result.append(model)
        return result

    async def suppliers(self, su: Actor) -> list[Supplier]:
        existing = {s.name: s for s in await self.uow.suppliers.list()}
        result = []
        for name, contact, phone, email, notes in SUPPLIERS:
            result.append(
                existing.get(name)
                or await admin.create_supplier(
                    self.uow, su, name=name, contact_person=contact, phone=phone, email=email, notes=notes
                )
            )
        return result

    async def customers(self, su: Actor, tenants: dict[str, Tenant]) -> dict[str, list[tuple[Customer, tuple]]]:
        """Sites by tenant code: (customer, (lat, lng, address, contact, phone))."""
        existing = {(c.tenant_id, c.company_name): c for c in await self.uow.customers.list()}
        sites: dict[str, list[tuple[Customer, tuple]]] = {}
        for code, _, rows in TENANTS:
            tenant = tenants[code]
            for company, contact, phone, level, address, site_rows in rows:
                customer = existing.get((tenant.id, company)) or await customers.create_customer(
                    self.uow, su, tenant_id=tenant.id, company_name=company, contact_person=contact, phone=phone,
                    service_level=level, address=address,
                )
                sites.setdefault(code, []).extend((customer, site) for site in site_rows)
        return sites

    # ---- devices ----

    def serial(self, model_index: int) -> str:
        prefix = MODELS[model_index][4]
        self.serial_counter[prefix] = self.serial_counter.get(prefix, 1000) + 1
        return f"{prefix}-{self.serial_counter[prefix]:04d}"

    def asset_tag(self, owner: str) -> str:
        prefix = {"TIMETECH": "TT", "SIAMSVC": "SS"}[owner]
        self.tag_counter[owner] = self.tag_counter.get(owner, 0) + 1
        return f"{prefix}-2026-{self.tag_counter[owner]:04d}"

    async def device(
        self,
        plan: Plan,
        models: list[DeviceModel],
        suppliers: list[Supplier],
        tenants: dict[str, Tenant],
        actors: dict[str, list[Actor]],
        sites: dict[str, list[tuple[Customer, tuple]]],
        site_cursor: dict[str, int],
    ) -> None:
        rng = self.rng
        central = actors[""]
        local = actors.get(plan.owner or "", central)
        _, _, _, firmware, _, cost = MODELS[plan.model]
        model = models[plan.model]
        first = plan.steps[0].at
        purchase = first.astimezone(BUSINESS_OFFSET).date() - timedelta(days=rng.randint(0, 10))
        today = self.now.astimezone(BUSINESS_OFFSET).date()
        warranty_end = (
            today + timedelta(days=plan.warranty_days)
            if plan.warranty_days is not None
            else purchase + timedelta(days=rng.choice([365, 730, 1095]))
        )
        serial = self.serial(plan.model)
        mac = ":".join(f"{rng.randrange(256):02X}" for _ in range(6))
        supplier = rng.choice(suppliers)
        installation_closes: list[datetime] = []
        install_times: list[datetime] = []
        loans: list[tuple[datetime, date]] = []
        device_id: UUID | None = None

        last_loan = max((i for i, s in enumerate(plan.steps) if s.kind == "loan"), default=-1)
        for index, step in enumerate(plan.steps):
            actor = rng.choice(local) if step.kind not in ("check_in_central", "transfer") else rng.choice(central)
            note = rng.choice(NOTES[step.kind]) if step.kind in NOTES else None
            match step.kind:
                case "check_in_central" | "check_in_tenant":
                    view = await inventory.check_in(
                        self.uow, actor, serial_number=serial, model_id=model.id, mac_address=mac,
                        purchase_date=purchase, cost=cost + Decimal(rng.randint(-5, 5) * 100),
                        warranty_end=max(warranty_end, purchase),
                        asset_tag=self.asset_tag(plan.owner) if plan.owner and rng.random() < 0.7 else None,
                        firmware_version=firmware if rng.random() < 0.8 else None,
                        supplier_id=supplier.id,
                    )
                    device_id = view.id
                    if rng.random() < 0.3:
                        await self.photo(PhotoOwner.DEVICE, device_id, demo_images.device_photo(serial, rng.randrange(1 << 30)),
                                         actor, "สภาพเครื่องตอนรับเข้า", step.at)
                case "transfer":
                    assert plan.owner is not None
                    await inventory.transfer(self.uow, actor, device_id, tenants[plan.owner].id, note)
                case "check_out":
                    await inventory.check_out(self.uow, actor, device_id, note)
                case "install":
                    code = plan.owner or ""
                    cursor = site_cursor.get(code, 0)
                    customer, (lat, lng, address, contact, phone) = sites[code][cursor % len(sites[code])]
                    site_cursor[code] = cursor + 1
                    jitter = lambda: rng.uniform(-0.0004, 0.0004)  # noqa: E731
                    installation = await inventory.install(
                        self.uow, actor, device_id=device_id, customer_id=customer.id,
                        install_date=step.at.astimezone(BUSINESS_OFFSET).date(),
                        latitude=lat + jitter(), longitude=lng + jitter(), address=address,
                        site_contact=contact, site_phone=phone,
                        notes=rng.choice([None, "ติดตั้งพร้อมกลอนแม่เหล็ก", "เดินสาย LAN ใหม่", "ใช้ PoE จากสวิตช์เดิม"]),
                    )
                    install_times.append(step.at)
                    for n in range(rng.choice([1, 1, 2])):
                        await self.photo(PhotoOwner.INSTALLATION, installation.id,
                                         demo_images.site_photo(serial, rng.randrange(1 << 30)),
                                         actor, ["หน้างานหลังติดตั้ง", "ตำแหน่งติดตั้งและการเดินสาย"][n], step.at)
                case "loan":
                    due = plan.loan_due if plan.loan_due is not None and index == last_loan else (
                        step.at.astimezone(BUSINESS_OFFSET).date() + timedelta(days=rng.randint(5, 14))
                    )
                    await inventory.loan(self.uow, actor, device_id, today, note)
                    loans.append((step.at, due))
                case "return":
                    if install_times and len(installation_closes) < len(install_times):
                        installation_closes.append(step.at)
                    await inventory.return_device(self.uow, actor, device_id, note)
                case "send_repair":
                    if install_times and len(installation_closes) < len(install_times):
                        installation_closes.append(step.at)
                    repairer = rng.choice(suppliers).id if rng.random() < 0.75 else None
                    await inventory.send_repair(self.uow, actor, device_id, note, repairer)
                case "repair_done":
                    await inventory.repair_done(self.uow, actor, device_id, note or "QC ผ่าน")
                case "qc_pass":
                    await inventory.qc_pass(self.uow, actor, device_id, note)
                case "qc_fail":
                    await inventory.qc_fail(self.uow, actor, device_id, note or "ไม่ผ่าน QC")
                case "retire":
                    await inventory.retire(self.uow, actor, device_id, note)
                case "edit":
                    changes = rng.choice([
                        {"firmware_version": MODELS[plan.model][3] + ".1"},
                        {"notes": "ติดสติกเกอร์รหัสทรัพย์สินใหม่"},
                        {"mac_address": ":".join(f"{rng.randrange(256):02X}" for _ in range(6))},
                    ])
                    await inventory.update_device(self.uow, actor, device_id, changes)
            if step.kind in PHOTO_CAPTIONS and rng.random() < 0.6:
                [tx] = await self.uow.transactions.list_views(device_id=device_id, limit=1)
                await self.photo(PhotoOwner.TRANSACTION, tx.id,
                                 demo_images.device_photo(serial, rng.randrange(1 << 30), damaged=step.kind != "repair_done"),
                                 actor, PHOTO_CAPTIONS[step.kind], step.at)

        assert device_id is not None
        await self.backdate(device_id, plan, install_times, installation_closes, loans)

    async def backdate(self, device_id: UUID, plan: Plan, install_times: list[datetime],
                       installation_closes: list[datetime], loans: list[tuple[datetime, date]]) -> None:
        tx_ids = (await self.session.execute(
            text("SELECT id FROM inventory_transactions WHERE device_id = :d ORDER BY occurred_at, id"),
            {"d": device_id},
        )).scalars().all()
        assert len(tx_ids) == len(plan.steps), (len(tx_ids), [s.kind for s in plan.steps])
        for tx_id, step in zip(tx_ids, plan.steps, strict=True):
            await self.session.execute(
                text("UPDATE inventory_transactions SET occurred_at = :at WHERE id = :id"), {"at": step.at, "id": tx_id}
            )
        await self.session.execute(
            text("UPDATE devices SET created_at = :at, updated_at = :last WHERE id = :d"),
            {"at": plan.steps[0].at, "last": plan.steps[-1].at, "d": device_id},
        )
        installation_ids = (await self.session.execute(
            text("SELECT id FROM installations WHERE device_id = :d ORDER BY removed_at NULLS LAST"), {"d": device_id}
        )).scalars().all()
        for index, installation_id in enumerate(installation_ids):
            closed = installation_closes[index] if index < len(installation_closes) else None
            await self.session.execute(
                text("UPDATE installations SET created_at = :at, removed_at = CASE WHEN removed_at IS NULL THEN NULL "
                     "ELSE CAST(:closed AS timestamptz) END WHERE id = :id"),
                {"at": install_times[index], "closed": closed, "id": installation_id},
            )
        loan_rows = (await self.session.execute(
            text("SELECT id, note FROM inventory_transactions WHERE device_id = :d AND transaction_type = 'LOAN' "
                 "ORDER BY occurred_at, id"), {"d": device_id},
        )).all()
        for (tx_id, note), (_, due) in zip(loan_rows, loans, strict=True):
            rest = note.split(" · ", 1)[1] if " · " in note else None
            await self.session.execute(
                text("UPDATE inventory_transactions SET note = :note WHERE id = :id"),
                {"note": f"ครบกำหนดคืน {due:%d/%m/%Y}" + (f" · {rest}" if rest else ""), "id": tx_id},
            )
        if plan.target == DeviceStatus.ON_LOAN and loans:
            await self.session.execute(
                text("UPDATE devices SET loan_due_date = :due WHERE id = :d"), {"due": loans[-1][1], "d": device_id}
            )

    async def extras(self, su: Actor, sites: dict[str, list[tuple[Customer, tuple]]], suppliers: list[Supplier]) -> None:
        """A few edits so record histories (audit log) have more than creations."""
        customer = sites["TIMETECH"][0][0]
        await customers.update_customer(self.uow, su, customer.id, {"phone": "02-000-0999", "notes": "ติดต่อฝ่ายอาคารก่อนเข้าหน้างาน"})
        await admin.update_supplier(self.uow, su, suppliers[2].id, {"phone": "081-000-0399"})
        active = await self.uow.installations.list_views(active_only=True)
        for view in active[:2]:
            await inventory.update_installation(self.uow, su, view.id, {"site_contact": "คุณประสาน (ผู้ประสานงานใหม่)"})

    async def finish_times(self, started: datetime) -> None:
        for photo_id, at in self.photo_times:
            await self.session.execute(text("UPDATE photos SET created_at = :at WHERE id = :id"), {"at": at, "id": photo_id})
        # Spread this run's audit entries over the history window, keeping their order.
        first = self.now - timedelta(days=HISTORY_DAYS)
        await self.session.execute(
            text(
                "WITH run AS (SELECT id, row_number() OVER (ORDER BY occurred_at, id) AS n, count(*) OVER () AS total "
                "FROM audit_logs WHERE occurred_at >= :started) "
                "UPDATE audit_logs a SET occurred_at = CAST(:first AS timestamptz) "
                "+ (run.n::float / run.total) * interval '89 days' "
                "FROM run WHERE a.id = run.id"
            ),
            {"started": started, "first": first},
        )


async def load_demo() -> None:
    settings = get_settings()
    if not settings.seed_admin_password:
        raise SystemExit("SEED_ADMIN_PASSWORD is not set")
    await seed()
    db = Database(settings.migration_database_url)
    storage = LocalPhotoStorage(settings.media_root, settings.jwt_secret)
    rng = random.Random(RANDOM_SEED)
    try:
        async with db.scoped(role="system", tenant_id=None) as session:
            started = (await session.execute(text("SELECT clock_timestamp()"))).scalar_one()
            loader = DemoLoader(session, storage, rng, settings.seed_admin_password)
            uow = loader.uow
            if await uow.users.get_by_email(MARKER_EMAIL):
                print("demo_data: already loaded, skipping")
                return
            root: User | None = await uow.users.get_by_email(settings.seed_admin_email)
            if root is None:
                raise SystemExit("demo_data: seed superadmin not found")
            su = Actor(user_id=root.id, role=Role.SUPERADMIN, tenant_id=None)

            tenants = await loader.tenants(su)
            actors = await loader.users(su, tenants)
            warehouse = actors[""][-1]
            actors[""] = [warehouse, su]
            models = await loader.models(su)
            suppliers = await loader.suppliers(su)
            sites = await loader.customers(su, tenants)

            plans = build_plans(rng, loader.now)
            site_cursor: dict[str, int] = {}
            for plan in plans:
                await loader.device(plan, models, suppliers, tenants, actors, sites, site_cursor)
            await loader.extras(su, sites, suppliers)
            await loader.finish_times(started)
            counts = await uow.devices.count_by_status()
            summary = ", ".join(f"{c.key}={c.count}" for c in counts)
            print(f"demo_data: loaded {len(plans)} devices ({summary}); users share the seed admin password")
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(load_demo())
