# myAssets-office — ระบบสต็อกและติดตามเครื่องลงเวลา

Angular 22 (Syncfusion 32.2.3, Material 3) · FastAPI · PostgreSQL 16 + PostGIS · nginx

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
cd frontend && npm ci && npm run license:generate && npx ng serve --port 4210
```

`backend/.env` ต้องใช้รหัสผ่านเดียวกับ `POSTGRES_PASSWORD` / `APP_DB_PASSWORD` ใน `.env` ของ Docker
