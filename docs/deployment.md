# คู่มือติดตั้ง SmartAsset Analytics บนเซิร์ฟเวอร์ Linux

ติดตั้งแบบ Docker Compose บนเครื่องเดียว มี 4 container: `nginx` (จุดเข้า), `frontend` (หน้าเว็บ Angular), `api` (FastAPI) และ `db` (PostgreSQL 16 + PostGIS) คู่มือนี้มีคำสั่งสำหรับ 2 ตระกูล: **Ubuntu/Debian** (`apt-get`) และ **Rocky Linux / AlmaLinux / RHEL / CentOS Stream 8-9** (`dnf`) ถ้าไม่แน่ใจว่าเครื่องเป็นตระกูลไหน ให้ดูด้วย `cat /etc/os-release` (ถ้าสั่ง `apt-get` แล้วขึ้น `command not found` แสดงว่าเป็นตระกูล RHEL) หัวข้อ 3 เป็นต้นไปใช้คำสั่งเดียวกันทั้งสองตระกูล

ตัวอย่างคำสั่งใช้ `sudo` ถ้า login เป็น `root` อยู่แล้ว (prompt ลงท้ายด้วย `#`) ตัด `sudo` ออกได้

สรุปขั้นตอน

1. [เตรียมเครื่อง](#1-เตรียมเครื่อง)
2. [ติดตั้ง Docker](#2-ติดตั้ง-docker)
3. [ดึงโค้ดและตั้งค่า `.env`](#3-ดึงโค้ดและตั้งค่า-env)
4. [เริ่มระบบ](#4-เริ่มระบบ)
5. [เปิด HTTPS ด้วยโดเมน](#5-เปิด-https-ด้วยโดเมน)
6. [สำรองและกู้คืนข้อมูล](#6-สำรองและกู้คืนข้อมูล)
7. [อัปเดตเวอร์ชัน](#7-อัปเดตเวอร์ชัน)
8. [แก้ปัญหาที่พบบ่อย](#8-แก้ปัญหาที่พบบ่อย)
9. [เช็กลิสต์ก่อนเปิดใช้งานจริง](#9-เช็กลิสต์ก่อนเปิดใช้งานจริง)

---

## 1. เตรียมเครื่อง

| รายการ | ขั้นต่ำ | แนะนำ |
| --- | --- | --- |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB + swap 2 GB | 4 GB ขึ้นไป |
| ดิสก์ | 20 GB | 40 GB ขึ้นไป (รูปภาพอุปกรณ์และไฟล์สำรองกินพื้นที่เพิ่มตามการใช้งาน) |
| ระบบปฏิบัติการ | Ubuntu 22.04 LTS หรือ Rocky/AlmaLinux/RHEL 8 | Ubuntu 24.04 LTS หรือ Rocky/AlmaLinux/RHEL 9 |

- ขั้น build หน้าเว็บ (Angular) ใช้ RAM ราว 2 GB ถ้าเครื่องมี RAM น้อยกว่า 4 GB ให้เปิด swap ก่อน (ดูหัวข้อ 8)
- ต้องออกอินเทอร์เน็ตได้ตอนติดตั้งและอัปเดต เพื่อดึง Docker image, แพ็กเกจ npm/Python และไลบรารีแผนที่
- ถ้าจะใช้ HTTPS ให้เตรียมโดเมน (เช่น `asset.example.com`) และตั้ง DNS record แบบ A ชี้มาที่ IP ของเซิร์ฟเวอร์ ฟีเจอร์ **ใช้ตำแหน่งปัจจุบัน** (GPS) และกล้องบนมือถือ ทำงานได้เฉพาะบน HTTPS

อัปเดตระบบ ตั้งเขตเวลา และเปิดไฟร์วอลล์

**Ubuntu/Debian** (ไฟร์วอลล์ `ufw`)

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo timedatectl set-timezone Asia/Bangkok

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

**Rocky/AlmaLinux/RHEL/CentOS Stream** (ไฟร์วอลล์ `firewalld`)

```bash
sudo dnf -y update
sudo timedatectl set-timezone Asia/Bangkok

sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=ssh --add-service=http --add-service=https
sudo firewall-cmd --reload
getenforce     # Enforcing = เปิด SELinux อยู่ ให้ทำขั้นตอน SELinux ในหัวข้อ 3 ด้วย
```

> **ข้อควรระวัง:** พอร์ตที่ Docker เปิด (`ports:` ใน compose) **ไม่ผ่านกฎของ ufw/firewalld** ถ้าไม่ต้องการให้พอร์ตใดเข้าถึงจากภายนอกได้ ต้องผูกไว้ที่ `127.0.0.1` แบบที่หัวข้อ 5 ทำ ส่วน `db` ไม่ได้เปิดพอร์ตออกนอก Docker อยู่แล้ว

## 2. ติดตั้ง Docker

ใช้ repository ทางการของ Docker เพราะแพ็กเกจที่มากับระบบ (`docker.io` ของ Ubuntu หรือ `podman-docker` ของ RHEL) ไม่มี Docker Compose v2

**Rocky/AlmaLinux/RHEL/CentOS Stream**

```bash
sudo dnf -y install dnf-plugins-core git curl tar
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
# --allowerasing ถอด podman/buildah/runc ที่ติดตั้งมากับระบบและชนกับ Docker ออกให้
sudo dnf -y install --allowerasing docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

# ถ้าไม่ได้ใช้ root: ให้ผู้ใช้ปัจจุบันสั่ง docker ได้โดยไม่ต้อง sudo แล้ว logout/login ใหม่หนึ่งครั้ง
sudo usermod -aG docker "$USER"
```

(ถ้าเป็น RHEL ที่ลงทะเบียน subscription แล้ว ใช้ repo `https://download.docker.com/linux/rhel/docker-ce.repo` แทนได้)

**Ubuntu/Debian**

```bash
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# ให้ผู้ใช้ปัจจุบันสั่ง docker ได้โดยไม่ต้อง sudo แล้ว logout/login ใหม่หนึ่งครั้ง
sudo usermod -aG docker "$USER"
```

ตรวจสอบ (ถ้าเพิ่งเพิ่มผู้ใช้เข้ากลุ่ม `docker` ให้ login ใหม่ก่อน)

```bash
docker --version
docker compose version    # ต้องเป็น v2.x
docker run --rm hello-world
```

Docker ตั้งให้เริ่มเองเมื่อบูตเครื่องอยู่แล้ว และทุก service ใน compose ตั้ง `restart: unless-stopped` ระบบจึงกลับมาเองหลังรีบูต

## 3. ดึงโค้ดและตั้งค่า `.env`

```bash
sudo mkdir -p /opt/smartasset && sudo chown "$USER": /opt/smartasset
git clone https://github.com/chanachaipmgeng/SmartAsset-Analytics.git /opt/smartasset
cd /opt/smartasset
cp .env.example .env
chmod 600 .env
```

ถ้า repository เป็น private ให้ใช้ SSH deploy key หรือ Personal Access Token ตอน `git clone`

**เฉพาะเครื่องที่เปิด SELinux** (`getenforce` ขึ้น `Enforcing` ซึ่งเป็นค่าเริ่มต้นของตระกูล RHEL) ให้ติดป้ายโฟลเดอร์ `nginx/` ให้ container อ่านได้ ไม่เช่นนั้น container `nginx` จะอ่านไฟล์ตั้งค่าไม่ได้ (`Permission denied`)

```bash
sudo chcon -Rt container_file_t /opt/smartasset/nginx
```

สร้างรหัสผ่านและ secret แบบสุ่ม (ได้เป็นตัวอักษร a-f และตัวเลข ซึ่งปลอดภัยสำหรับ URL ของฐานข้อมูล) แล้วเขียนลง `.env`

```bash
sed -i \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" \
  -e "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=$(openssl rand -hex 24)/" \
  -e "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" \
  .env
nano .env    # แก้ค่าที่เหลือตามตารางด้านล่าง (ตระกูล RHEL ติดตั้งด้วย dnf -y install nano หรือใช้ vi)
```

| ตัวแปร | ค่าที่ต้องตั้ง |
| --- | --- |
| `PUBLIC_URL` | URL ที่ผู้ใช้เปิดในเบราว์เซอร์ (API อนุญาต CORS ให้ URL นี้) เช่น `https://asset.example.com` หรือ `http://203.0.113.10` (ใส่พอร์ตด้วยถ้าไม่ใช่ 80/443) |
| `HTTP_PORT` | พอร์ตของ nginx ใน compose: `80` ถ้าเปิดตรง หรือ `127.0.0.1:8080` ถ้าใช้ HTTPS ตามหัวข้อ 5 |
| `APP_VERSION` | ป้ายกำกับ image เช่น `1.0.0` (ใช้แยกเวอร์ชันตอนอัปเดต ไม่บังคับ) |
| `POSTGRES_PASSWORD` | รหัสผ่านเจ้าของฐานข้อมูล ใช้รัน migration (สุ่มแล้วด้วยคำสั่งด้านบน) |
| `APP_DB_PASSWORD` | รหัสผ่านที่แอปใช้ต่อฐานข้อมูล ซึ่งอยู่ภายใต้ Row-Level Security (สุ่มแล้ว) |
| `JWT_SECRET` | กุญแจลงนาม token และลิงก์รูปภาพ อย่างน้อย 32 ตัวอักษร (สุ่มแล้ว) ถ้าเปลี่ยนภายหลัง ผู้ใช้ทุกคนต้องเข้าสู่ระบบใหม่ |
| `SEED_ON_START` | `true` สร้างผู้ดูแลแพลตฟอร์มตอนเริ่มครั้งแรก เจอบัญชีแล้วจะข้าม |
| `SEED_ADMIN_EMAIL` | อีเมลผู้ดูแลแพลตฟอร์มคนแรก |
| `SEED_ADMIN_PASSWORD` | รหัสผ่านผู้ดูแลคนแรก อย่างน้อย 8 ตัว ใช้ตัวอักษรและตัวเลขเท่านั้น เปลี่ยนในหน้าโปรไฟล์ได้หลังเข้าสู่ระบบ |
| `SEED_SAMPLE_DATA` | **`false` บนเครื่องจริง** ถ้าเป็น `true` ระบบจะสร้างกลุ่มลูกค้าตัวอย่าง 2 กลุ่ม บัญชี `tenant.admin@example.com` และอุปกรณ์ตัวอย่าง 6 เครื่อง ซึ่งลบภายหลังไม่ได้ |
| `API_WORKERS` | จำนวน process ของ API โดยทั่วไปเท่ากับจำนวน vCPU |
| `SYNCFUSION_LICENSE` | license key ของ Syncfusion ถ้าเว้นว่าง หน้าเว็บจะขึ้นแถบแจ้งเตือน license |
| `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS` | อายุ token (ค่าเริ่มต้น 15 นาที / 7 วัน) |

รหัสผ่านทุกตัวใน `.env` ให้ใช้ตัวอักษรและตัวเลขเท่านั้น เพราะถูกนำไปต่อเป็น URL ของฐานข้อมูล

> `POSTGRES_PASSWORD` และ `APP_DB_PASSWORD` มีผลเฉพาะตอนสร้างฐานข้อมูลครั้งแรก ถ้าแก้ใน `.env` ภายหลัง ต้องเปลี่ยนในฐานข้อมูลด้วย (ดูหัวข้อ 8)

## 4. เริ่มระบบ

```bash
cd /opt/smartasset
docker compose up -d --build
```

ครั้งแรกใช้เวลาราว 5-15 นาทีสำหรับ build image ตอนเริ่ม `api` จะรัน migration และสร้างผู้ดูแลแพลตฟอร์มให้อัตโนมัติ ตรวจสถานะด้วยคำสั่งต่อไปนี้

```bash
docker compose ps                      # ทุก service ต้องเป็น running และ (healthy)
docker compose logs api --tail 50      # ควรเห็น "Applying database migrations..." และ "seed: done"
curl -fsS http://127.0.0.1/health; echo     # ใช้ http://127.0.0.1:8080/health ถ้าตั้ง HTTP_PORT ตามหัวข้อ 5
```

เปิด `PUBLIC_URL` ในเบราว์เซอร์ แล้วเข้าสู่ระบบด้วย `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` จากนั้นทำต่อดังนี้

1. เปลี่ยนรหัสผ่านที่ **เมนูผู้ใช้ → โปรไฟล์**
2. สร้าง **กลุ่มลูกค้า** รุ่นอุปกรณ์ ผู้จำหน่าย และผู้ใช้งานตามคู่มือผู้ใช้ ([docs/user-guide/README.md](user-guide/README.md) หัวข้อ 11)
3. รับอุปกรณ์เข้าคลังทีละเครื่องหรือนำเข้าจาก Excel (คู่มือผู้ใช้หัวข้อ 3 และ 7)

> ห้ามรัน `python -m app.infrastructure.demo_data` บนเครื่องจริง คำสั่งนี้เติมข้อมูลสาธิตหลายสิบรายการ และผู้ใช้ตัวอย่างทุกคนใช้รหัสผ่านเดียวกับผู้ดูแล

คำสั่งที่ใช้บ่อย

```bash
docker compose ps                         # สถานะ
docker compose logs -f api                # ดู log ของ API (Ctrl C เพื่อออก)
docker compose restart api                # รีสตาร์ต service เดียว
docker compose down                       # หยุดทั้งหมด (ข้อมูลยังอยู่ใน volume)
docker compose exec api python -m app.infrastructure.check_integrity   # ตรวจความถูกต้องของข้อมูล
```

> ห้ามใช้ `docker compose down -v` เพราะ `-v` จะลบ volume `pgdata` (ฐานข้อมูล) และ `media` (รูปภาพ) ทิ้ง

## 5. เปิดผ่าน reverse proxy / HTTPS

แอปใน Docker มี nginx ของตัวเองอยู่แล้ว แต่ถ้าเครื่องมี nginx (หรือ reverse proxy อื่น) ฟังพอร์ต 80 อยู่ก่อน **อย่าให้ Docker แย่งพอร์ต 80** ให้ย้าย Docker ไปฟังเฉพาะในเครื่อง แล้วให้ nginx ของโฮสต์ส่งต่อไป

**5.1 ย้าย Docker ไปฟังเฉพาะภายในเครื่อง** แก้ `.env`

```bash
HTTP_PORT=127.0.0.1:8080
PUBLIC_URL=https://asset.example.com   # หรือ http://IP ถ้ายังไม่มีโดเมน/HTTPS
```

```bash
docker compose up -d
curl -fsS http://127.0.0.1:8080/health; echo
```

### 5.2 มี nginx ของโฮสต์อยู่แล้ว (แนะนำถ้าเครื่องนี้ใช้ nginx อยู่)

ไฟล์หลักของโฮสต์มักเป็น `/etc/nginx/nginx.conf` และมีบรรทัด `include /etc/nginx/conf.d/*.conf;` อยู่แล้ว **อย่าแทนที่ไฟล์หลัก** ให้เพิ่มไฟล์ไซต์ใหม่

```bash
# ตรวจว่า nginx ของโฮสต์ครองพอร์ต 80 อยู่จริง
ss -ltnp | grep -E ':80|:443'

# SELinux (ตระกูล RHEL): อนุญาตให้ nginx ส่งต่อไปยังพอร์ต 8080
setsebool -P httpd_can_network_connect 1
```

สร้าง `/etc/nginx/conf.d/smartasset.conf` (แทน `asset.example.com` ด้วยโดเมนหรือ `_` ถ้าเข้าด้วย IP)

```nginx
# /etc/nginx/conf.d/smartasset.conf
upstream smartasset {
    server 127.0.0.1:8080;
    keepalive 16;
}

server {
    listen 80;
    server_name asset.example.com;   # หรือ _ ถ้ายังไม่มีโดเมน

    client_max_body_size 10m;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_pass http://smartasset;
    }
}
```

```bash
nginx -t && systemctl reload nginx
curl -fsS -H 'Host: asset.example.com' http://127.0.0.1/health; echo
```

ถ้าโฮสต์มี HTTPS อยู่แล้ว (ใบรับรองใน `/etc/nginx/ssl/` หรือ Let's Encrypt) ให้ใส่ `listen 443 ssl;` พร้อม `ssl_certificate` / `ssl_certificate_key` ใน `server` เดียวกัน และตั้ง `PUBLIC_URL=https://...` ให้ตรง ฟีเจอร์ GPS และกล้องบนมือถือต้องใช้ HTTPS

> ไฟล์ `nginx.conf` บน Desktop ที่เป็น config หลักของโฮสต์ **ไม่ต้องแก้** และ **ไม่ใช่** ไฟล์เดียวกับ `nginx/nginx.conf` ในโปรเจกต์ (อันนั้นใช้ใน container ของแอปเท่านั้น)

### 5.3 ยังไม่มี reverse proxy — ใช้ Caddy

ใช้ [Caddy](https://caddyserver.com) เป็น reverse proxy หน้า Docker ซึ่งขอและต่ออายุใบรับรอง Let's Encrypt ให้อัตโนมัติ ก่อนเริ่มต้องตั้ง DNS ของโดเมนชี้มาที่เซิร์ฟเวอร์แล้ว และเปิดพอร์ต 80/443 ไว้ (ทำหัวข้อ 5.1 ก่อน)

**Ubuntu/Debian**

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

**Rocky/AlmaLinux/RHEL/CentOS Stream**

```bash
sudo dnf -y install 'dnf-command(copr)'
sudo dnf -y copr enable @caddy/caddy
sudo dnf -y install caddy
sudo systemctl enable --now caddy
setsebool -P httpd_can_network_connect 1
```

แทนที่เนื้อหา `/etc/caddy/Caddyfile` ด้วย

```caddy
asset.example.com {
    encode zstd gzip
    request_body {
        max_size 10MB
    }
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
sudo journalctl -u caddy --since "5 min ago"
```

เปิด `https://asset.example.com` ถ้าขึ้นรูปกุญแจแสดงว่าเรียบร้อย

ถ้าองค์กรมี load balancer อยู่แล้ว ให้ส่งต่อทุก path ไปที่ `http://<เซิร์ฟเวอร์>:8080` โดยไม่ต้องติดตั้ง Caddy / แก้ nginx ของโฮสต์

## 6. สำรองและกู้คืนข้อมูล

ข้อมูลที่ต้องสำรองมี 3 อย่าง

- ฐานข้อมูล (volume `pgdata`)
- รูปภาพที่อัปโหลด (volume `media`)
- ไฟล์ `.env` ซึ่งต้องใช้ `JWT_SECRET` เดิมกับรูปภาพ และรหัสผ่านเดิมกับฐานข้อมูล

`scripts/backup.sh` สำรองฐานข้อมูลด้วย `pg_dump` และบีบอัดรูปภาพ เก็บไว้ที่ `/var/backups/smartasset` และลบไฟล์ที่เก่ากว่า 14 วันให้เอง เปลี่ยนจำนวนวันได้ด้วยตัวแปร `KEEP_DAYS`

```bash
sudo mkdir -p /var/backups/smartasset && sudo chown "$USER": /var/backups/smartasset
cd /opt/smartasset && scripts/backup.sh
```

ตั้งให้สำรองทุกวันเวลา 02:30 ด้วย `crontab -e` แล้วเพิ่มบรรทัด

```cron
30 2 * * * cd /opt/smartasset && scripts/backup.sh >> /var/log/smartasset-backup.log 2>&1
```

(สร้างไฟล์ log ให้ผู้ใช้เขียนได้ก่อน: `sudo touch /var/log/smartasset-backup.log && sudo chown "$USER": /var/log/smartasset-backup.log`)

ไฟล์สำรองอยู่บนเครื่องเดียวกับระบบ จึงควรคัดลอกออกไปเก็บที่อื่นเป็นประจำ เช่น `rsync` ไป NAS หรือใช้ `rclone` ส่งขึ้น cloud storage และเก็บสำเนา `.env` ไว้ในที่ปลอดภัยแยกต่างหาก

**กู้คืน** (บนเครื่องเดิม หรือเครื่องใหม่ที่ติดตั้งตามหัวข้อ 2-4 แล้ว และใช้ `.env` ชุดเดิม)

```bash
cd /opt/smartasset
docker compose up -d                       # ให้ migration สร้างโครงสร้างและ role ของฐานข้อมูลก่อน
docker compose stop api nginx              # หยุดการเขียนข้อมูลระหว่างกู้คืน

docker compose exec -T db pg_restore -U inventory_owner -d inventory --clean --if-exists --no-owner --role=inventory_owner \
  < /var/backups/smartasset/db-YYYYMMDD-HHMMSS.dump
docker compose run --rm -T --no-deps --entrypoint sh api -c "tar -C /data/media -xzf -" \
  < /var/backups/smartasset/media-YYYYMMDD-HHMMSS.tgz

docker compose up -d
docker compose exec api python -m app.infrastructure.check_integrity
```

`check_integrity` ต้องไม่รายงานปัญหา ควรซ้อมกู้คืนบนเครื่องทดสอบอย่างน้อยหนึ่งครั้ง เพื่อยืนยันว่าไฟล์สำรองใช้ได้จริง

## 7. อัปเดตเวอร์ชัน

```bash
cd /opt/smartasset
scripts/backup.sh                 # สำรองก่อนทุกครั้ง
git pull
docker compose up -d --build      # build ใหม่ แล้วรัน migration ให้อัตโนมัติตอน api เริ่ม
docker compose ps
docker image prune -f             # ลบ image เก่าที่ไม่ได้ใช้
```

ระหว่าง build ระบบเดิมยังให้บริการได้ ช่วงที่ระบบใช้งานไม่ได้มีแค่ตอนสลับ container ราว 10-30 วินาที

migration เดินหน้าอย่างเดียว ถ้าเวอร์ชันใหม่มีปัญหาและต้องย้อนกลับ ให้ `git checkout <commit เดิม>` แล้วกู้คืนฐานข้อมูลจากไฟล์ที่สำรองไว้ก่อนอัปเดต (หัวข้อ 6)

## 8. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
| --- | --- |
| build หน้าเว็บหยุดกลางคัน หรือขึ้น `Killed` / `JavaScript heap out of memory` | RAM ไม่พอ ให้เพิ่ม swap แล้ว build ใหม่: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' \| sudo tee -a /etc/fstab` |
| `sudo: apt-get: command not found` | เครื่องเป็นตระกูล RHEL (Rocky/AlmaLinux/CentOS) ให้ใช้คำสั่ง `dnf` ในหัวข้อ 1-2 และ 5.2 |
| `Failed to download metadata for repo 'pgdg-…'` / URL มี `rhel-9.-x86_64` | repo PostgreSQL บนโฮสต์พังหรือตั้งผิด (แอปนี้ใช้ DB ใน Docker ไม่ต้องใช้ repo นี้) ปิดแล้วลองใหม่: `dnf config-manager --disable 'pgdg*'` หรือลบไฟล์ใน `/etc/yum.repos.d/pgdg*.repo` แล้ว `dnf clean all` |
| `nginx` restart วน และ log ขึ้น `open() "/etc/nginx/conf.d/default.conf" failed (13: Permission denied)` | SELinux บล็อกการอ่านไฟล์ตั้งค่า ให้สั่ง `sudo chcon -Rt container_file_t /opt/smartasset/nginx` แล้ว `docker compose up -d` |
| HTTPS ขึ้น `502` แต่ `curl http://127.0.0.1:8080/health` ได้ปกติ (ตระกูล RHEL) | SELinux บล็อก Caddy ไม่ให้ต่อพอร์ต 8080 ให้สั่ง `sudo setsebool -P httpd_can_network_connect 1` |
| `docker compose up` แจ้ง `set POSTGRES_PASSWORD in .env` | ยังไม่ได้สร้าง `.env` หรือไม่ได้สั่งคำสั่งในโฟลเดอร์ `/opt/smartasset` |
| `Bind for 0.0.0.0:80 failed: port is already allocated` | มี nginx/apache ของโฮสต์ใช้พอร์ต 80 อยู่ ตรวจด้วย `ss -ltnp \| grep :80` แล้วทำหัวข้อ 5.1–5.2 (อย่าหยุด nginx ของโฮสต์ถ้ายังมีเว็บอื่นอยู่) |
| `api` ขึ้น `password authentication failed` | รหัสผ่านใน `.env` ไม่ตรงกับในฐานข้อมูล (มักเกิดเมื่อแก้ `.env` หลังเริ่มครั้งแรก) ให้ตั้งรหัสในฐานข้อมูลให้ตรง: `docker compose exec db psql -U inventory_owner -d inventory -c "ALTER ROLE inventory_app PASSWORD '<APP_DB_PASSWORD>'"` แล้ว `docker compose restart api` (ถ้าเปลี่ยน `POSTGRES_PASSWORD` ให้ทำแบบเดียวกันกับ role `inventory_owner`) |
| ขึ้น `502 Bad Gateway` หลังเริ่มระบบ | `api` ยังรัน migration อยู่ รอสักครู่แล้วดู `docker compose logs api` ถ้ายังไม่หายให้ดูข้อความ error ใน log |
| ปุ่ม **ใช้ตำแหน่งปัจจุบัน** หรือกล้องสแกนบนมือถือไม่ทำงาน | เบราว์เซอร์อนุญาตฟีเจอร์นี้เฉพาะบน HTTPS ให้ตั้งค่าตามหัวข้อ 5 |
| หน้าเว็บขึ้นแถบแจ้งเตือน license ของ Syncfusion | ใส่ `SYNCFUSION_LICENSE` ใน `.env` แล้ว `docker compose up -d frontend` (ไม่ต้อง build ใหม่) |
| ดิสก์ใกล้เต็ม | ดูด้วย `docker system df` ลบ image และ build cache เก่าด้วย `docker image prune -f && docker builder prune -f` และตรวจขนาดโฟลเดอร์สำรองข้อมูล |

## 9. เช็กลิสต์ก่อนเปิดใช้งานจริง

- [ ] `.env` ใช้รหัสผ่านและ `JWT_SECRET` แบบสุ่ม, `chmod 600` แล้ว และมีสำเนาเก็บไว้ในที่ปลอดภัย
- [ ] `SEED_SAMPLE_DATA=false` ตั้งแต่ก่อนเริ่มระบบครั้งแรก และไม่ได้รัน `demo_data`
- [ ] เปลี่ยนรหัสผ่านผู้ดูแลแพลตฟอร์มหลังเข้าสู่ระบบครั้งแรกแล้ว
- [ ] ใช้งานผ่าน HTTPS และ `PUBLIC_URL` เป็น `https://...` ตรงกับโดเมนจริง
- [ ] ไฟร์วอลล์เปิดเฉพาะ SSH, 80 และ 443 และพอร์ต nginx ของ compose ผูกไว้ที่ `127.0.0.1`
- [ ] ตั้ง cron สำรองข้อมูลแล้ว มีการคัดลอกไฟล์สำรองออกนอกเครื่อง และซ้อมกู้คืนแล้วอย่างน้อยหนึ่งครั้ง
- [ ] ใส่ `SYNCFUSION_LICENSE` แล้ว
- [ ] ตั้งเขตเวลาเครื่องเป็น `Asia/Bangkok` เพื่อให้เวลาใน log และชื่อไฟล์สำรองตรงกับเวลาจริง
