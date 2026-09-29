# myAssets-office — ระบบสต็อกและติดตามเครื่องลงเวลา

ติดตามอุปกรณ์ (เครื่องสแกนหน้า/ลายนิ้วมือ ฯลฯ) รายเครื่องตั้งแต่รับเข้าคลัง โอนให้กลุ่มลูกค้า เบิกออก ติดตั้งที่หน้างานพร้อมพิกัด ส่งซ่อม/QC จนปลดระวาง โดยทุกการเคลื่อนไหวถูกบันทึกเป็นประวัติ ข้อมูลแต่ละกลุ่มลูกค้าแยกกันด้วย Row-Level Security

Angular 22 (Syncfusion 32.2.3 Material 3, Tailwind v4) · FastAPI · PostgreSQL 16 + PostGIS · nginx

## เอกสาร

| เอกสาร | สำหรับ |
| --- | --- |
| [docs/user-guide/README.md](docs/user-guide/README.md) | คู่มือผู้ใช้ พร้อมภาพหน้าจอทุกขั้นตอน |
| [docs/architecture.md](docs/architecture.md) | สถาปัตยกรรม, กฎธุรกิจ, API, แนวทางเขียนโค้ดและสไตล์ |
| `.cursor/rules/`, `.cursor/skills/` | กฎและขั้นตอนงานสำหรับ AI agent ใน Cursor |

## ความสามารถหลัก

- แดชบอร์ด: จำนวนตามสถานะพร้อมแนวโน้ม 7 วัน, กราฟ 30 วัน, กิจกรรมล่าสุด
- อุปกรณ์: รับเข้า, นำเข้าจาก Excel/CSV (ตรวจก่อนบันทึก), โอน, เบิก, ติดตั้ง, รับคืน, ส่งซ่อม/QC, ปลดระวาง, ประวัติรายเครื่อง
- สถานีสแกน: เครื่องยิงบาร์โค้ดหรือกล้อง แล้วทำรายการได้ทันที
- ลูกค้า, จุดติดตั้งบนแผนที่ และค้นหาอุปกรณ์ในรัศมี
- ตั้งค่ารุ่นอุปกรณ์ กลุ่มลูกค้า ผู้ใช้ (4 บทบาท), ธีมสว่าง/มืด, ใช้งานบนมือถือได้

## ติดตั้งด้วย Docker

ต้องมี Docker Engine และ Docker Compose v2

```bash
cp .env.example .env      # แล้วแก้ทุกค่า (รหัสผ่านใช้ตัวอักษร/ตัวเลขเท่านั้น)
docker compose up -d --build
```

เปิด `PUBLIC_URL` (ค่าเริ่มต้น http://localhost) แล้วเข้าสู่ระบบด้วย `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`

| บริการ | หน้าที่ |
|---|---|
| `nginx` | จุดเข้าเดียว (พอร์ต `HTTP_PORT`) ส่ง `/api`, `/docs`, `/health` ไป API ที่เหลือไปหน้าเว็บ |
| `frontend` | ไฟล์ Angular ที่ build แล้ว; เขียน `app-config.json` จาก `SYNCFUSION_LICENSE` ตอนเริ่ม |
| `api` | FastAPI; รัน migration (และ seed เมื่อ `SEED_ON_START=true`) ก่อนเริ่มทุกครั้ง |
| `db` | PostgreSQL + PostGIS; ข้อมูลอยู่ใน volume `pgdata` |

## คำสั่งที่ใช้บ่อย

```bash
docker compose ps                     # สถานะ
docker compose logs -f api            # ดู log
docker compose up -d --build          # อัปเดตหลังแก้โค้ด
docker compose exec db pg_dump -U inventory_owner inventory > backup.sql   # สำรองข้อมูล
```

## พัฒนาบนเครื่อง

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db   # เปิด DB ที่ 127.0.0.1:5434
cd backend && uv sync && uv run uvicorn app.main:app --port 8001 --reload
cd frontend && npm ci && npm run license:generate && npx ng serve --port 4210   # proxy /api → 8001
```

`backend/.env` ต้องใช้รหัสผ่านเดียวกับ `POSTGRES_PASSWORD` / `APP_DB_PASSWORD` ใน `.env` ของ Docker

ถ้าเคยรัน `docker compose up` แบบไม่มีไฟล์ dev ภายหลัง DB จะไม่เปิดพอร์ต 5434 ให้รันคำสั่งบรรทัดแรกอีกครั้ง

## ทดสอบ

```bash
cd backend && uv run pytest          # test_api_flow ต้องมี DB ที่ migrate + seed แล้ว
cd frontend && npx ng build && npx ng test
```
