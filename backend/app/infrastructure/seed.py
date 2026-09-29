"""Idempotent demo data. Run: uv run python -m app.infrastructure.seed"""

import asyncio
from datetime import date, timedelta
from decimal import Decimal

from app.application import admin, customers, inventory
from app.application.context import Actor
from app.core.config import get_settings
from app.domain.entities import User
from app.domain.enums import Role, ServiceLevel
from app.infrastructure.db.repositories import SqlUnitOfWork
from app.infrastructure.db.session import Database
from app.infrastructure.security import Argon2PasswordHasher


async def seed() -> None:
    settings = get_settings()
    if not settings.seed_admin_password:
        raise SystemExit("SEED_ADMIN_PASSWORD is not set")
    db = Database(settings.migration_database_url)
    hasher = Argon2PasswordHasher()
    try:
        async with db.scoped(role="system", tenant_id=None) as session:
            uow = SqlUnitOfWork(session)
            if await uow.users.get_by_email(settings.seed_admin_email):
                print("seed: already applied, skipping")
                return

            root = User(
                email=settings.seed_admin_email,
                full_name="ผู้ดูแลแพลตฟอร์ม",
                role=Role.SUPERADMIN,
                password_hash=hasher.hash(settings.seed_admin_password),
            )
            await uow.users.add(root)
            await uow.flush()
            su = Actor(user_id=root.id, role=Role.SUPERADMIN, tenant_id=None)

            demo = await admin.create_tenant(uow, su, name="บริษัท ไทมเทค โซลูชั่น จำกัด", code="TIMETECH")
            await admin.create_tenant(uow, su, name="บริษัท สยามเซอร์วิส จำกัด", code="SIAMSVC")
            await admin.create_user(
                uow,
                hasher,
                su,
                email="tenant.admin@example.com",
                full_name="ผู้ดูแล ไทมเทค",
                role=Role.TENANT_ADMIN,
                password=settings.seed_admin_password,
                tenant_id=demo.id,
            )

            face = await admin.create_device_model(
                uow, su, brand="ZKTeco", name="SpeedFace-V5L", device_type="สแกนใบหน้า", firmware_version="6.60"
            )
            finger = await admin.create_device_model(
                uow, su, brand="ZKTeco", name="MB460", device_type="สแกนลายนิ้วมือ", firmware_version="6.4.1"
            )
            hik = await admin.create_device_model(
                uow, su, brand="Hikvision", name="DS-K1T341", device_type="สแกนใบหน้า", firmware_version="3.2"
            )

            today = date.today()
            specs = [
                ("ZK-V5L-0001", face, "00:17:61:AA:00:01", 730),
                ("ZK-V5L-0002", face, "00:17:61:AA:00:02", 20),
                ("ZK-MB460-0001", finger, "00:17:61:BB:00:01", 365),
                ("ZK-MB460-0002", finger, "00:17:61:BB:00:02", 10),
                ("HIK-341-0001", hik, "44:19:B6:CC:00:01", 540),
                ("HIK-341-0002", hik, "44:19:B6:CC:00:02", 540),
            ]
            devices = []
            for serial, model, mac, warranty_days in specs:
                devices.append(
                    await inventory.check_in(
                        uow,
                        su,
                        serial_number=serial,
                        model_id=model.id,
                        mac_address=mac,
                        purchase_date=today - timedelta(days=200),
                        cost=Decimal("12500.00"),
                        warranty_end=today + timedelta(days=warranty_days),
                    )
                )

            for d in devices[:5]:
                await inventory.transfer(uow, su, d.id, demo.id, "ส่งมอบให้กลุ่มลูกค้า")

            bkk = await customers.create_customer(
                uow, su, tenant_id=demo.id, company_name="โรงงานบางนาอุตสาหกรรม",
                contact_person="คุณสมชาย", phone="02-000-0001", service_level=ServiceLevel.PREMIUM,
            )
            cnx = await customers.create_customer(
                uow, su, tenant_id=demo.id, company_name="โรงแรมเชียงใหม่ริเวอร์",
                contact_person="คุณสมหญิง", phone="053-000-002", service_level=ServiceLevel.STANDARD,
            )

            sites = [
                (devices[0], bkk, 13.6680, 100.6045, "ถนนบางนา-ตราด กม.3 กรุงเทพมหานคร"),
                (devices[1], bkk, 13.6702, 100.6101, "อาคารสำนักงาน บางนา กรุงเทพมหานคร"),
                (devices[2], cnx, 18.7883, 98.9853, "ถนนเจริญประเทศ เชียงใหม่"),
            ]
            for device, customer, lat, lng, addr in sites:
                await inventory.check_out(uow, su, device.id, "เบิกเพื่อติดตั้ง")
                await inventory.install(
                    uow, su, device_id=device.id, customer_id=customer.id,
                    install_date=today - timedelta(days=30), latitude=lat, longitude=lng, address=addr,
                )
            await inventory.check_out(uow, su, devices[3].id, "ช่างเบิกไปหน้างาน")
            print(f"seed: done. superadmin={settings.seed_admin_email}, tenant admin=tenant.admin@example.com")
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
