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
docker compose exec api python -m app.infrastructure.demo_data            # ใส่ข้อมูลตัวอย่าง (รันซ้ำได้)
```

### ข้อมูลตัวอย่าง

`python -m app.infrastructure.demo_data` เติมข้อมูลสาธิตต่อจาก seed: กลุ่มลูกค้า TIMETECH และ SIAMSVC พร้อมลูกค้ากลุ่มละ 5-6 ราย, ผู้ใช้ทุกบทบาท (รวมเจ้าหน้าที่คลังกลาง `warehouse@example.com`) พร้อมรูปโปรไฟล์, รุ่น 6 รุ่นพร้อมรูป, ผู้จำหน่าย 4 ราย และอุปกรณ์ราว 70 เครื่องครบทุกสถานะ (ติดตั้ง ~20 เครื่องที่ ~12 จุด, ยืมเกินกำหนด, รอ QC, ซ่อมนานเกิน 14 วัน, ประกันใกล้หมด, ปลดระวาง, สต็อกกลาง) ประวัติย้อนหลัง 90 วันพร้อมรูปประกอบ ผู้ใช้ตัวอย่างทุกคนใช้รหัสผ่านเดียวกับ `SEED_ADMIN_PASSWORD` คำสั่งรันซ้ำได้ (เจอข้อมูลแล้วจะข้าม) และใช้ random seed คงที่ ห้ามรันบนระบบจริง

## พัฒนาบนเครื่อง

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db   # เปิด DB ที่ 127.0.0.1:5434
cd backend && uv sync && uv run uvicorn app.main:app --port 8001 --reload
cd frontend && npm ci && npm run license:generate && npx ng serve --port 4210   # proxy /api → 8001
```

`backend/.env` ต้องใช้รหัสผ่านเดียวกับ `POSTGRES_PASSWORD` / `APP_DB_PASSWORD` ใน `.env` ของ Docker ถ้าไม่ตรงกัน `uv run pytest` / `uvicorn` บนเครื่องจะต่อ DB ไม่ได้ (password authentication failed) ให้แก้ `backend/.env` หรือรันทดสอบใน container ด้วย `scripts/verify.ps1` แทน

ถ้าเคยรัน `docker compose up` แบบไม่มีไฟล์ dev ภายหลัง DB จะไม่เปิดพอร์ต 5434 ให้รันคำสั่งบรรทัดแรกอีกครั้ง (ตรวจด้วย `docker compose port db 5432`)

## ทดสอบ

```powershell
./scripts/verify.ps1                 # ruff, pytest ใน container api, prettier, ng build, ng test
./scripts/verify.ps1 -Skip backend   # ข้ามขั้นที่ไม่ต้องการ: lint, backend, format, build, test
```

รันทีละส่วน:

```bash
cd backend && uv run ruff check && uv run pytest    # pytest ต้องมี DB ที่ migrate + seed แล้ว และ backend/.env ตรงกับ Docker
cd frontend && npm run format:check && npx ng build && npx ng test --watch=false
docker compose exec api python -m app.infrastructure.check_integrity   # ตรวจความถูกต้องของข้อมูลใน DB
```
