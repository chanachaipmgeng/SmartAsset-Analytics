"""End-to-end API flow against the dev PostGIS database (requires `docker compose up` + migrations + seed)."""

import secrets
from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.main import app

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest.fixture(scope="session")
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
            yield c


async def login(client: httpx.AsyncClient, email: str, password: str) -> dict[str, str]:
    res = await client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def _cleanup(tenant_ids: list[str], model_id: str) -> None:
    """Remove this run's rows via the owner role (bypasses RLS) so the dev database stays clean."""
    engine = create_async_engine(get_settings().migration_database_url)
    params = {"tenants": tenant_ids, "model": model_id}
    device_filter = "SELECT id FROM devices WHERE model_id = CAST(:model AS uuid)"
    async with engine.begin() as conn:
        for stmt in (
            f"DELETE FROM installations WHERE device_id IN ({device_filter})",
            f"DELETE FROM inventory_transactions WHERE device_id IN ({device_filter})",
            "DELETE FROM devices WHERE model_id = CAST(:model AS uuid)",
            "DELETE FROM customers WHERE tenant_id = ANY(CAST(:tenants AS uuid[]))",
            "DELETE FROM users WHERE tenant_id = ANY(CAST(:tenants AS uuid[]))",
            "DELETE FROM tenants WHERE id = ANY(CAST(:tenants AS uuid[]))",
            "DELETE FROM device_models WHERE id = CAST(:model AS uuid)",
        ):
            await conn.execute(text(stmt), params)
    await engine.dispose()


@pytest.fixture(scope="session")
async def world(client: httpx.AsyncClient) -> AsyncIterator[dict]:
    s = get_settings()
    su = await login(client, s.seed_admin_email, s.seed_admin_password)
    tag = secrets.token_hex(3).upper()
    password = secrets.token_urlsafe(12)

    tenant_a = (await client.post("/tenants", headers=su, json={"name": f"A {tag}", "code": f"A{tag}"})).json()
    tenant_b = (await client.post("/tenants", headers=su, json={"name": f"B {tag}", "code": f"B{tag}"})).json()
    model = (
        await client.post("/device-models", headers=su, json={"brand": "Test", "name": f"M-{tag}", "device_type": "face"})
    ).json()

    users = {}
    for key, tenant, role in (("a", tenant_a, "tenant_admin"), ("b", tenant_b, "tenant_admin"), ("viewer", tenant_a, "viewer")):
        email = f"{key}.{tag.lower()}@example.com"
        res = await client.post(
            "/users",
            headers=su,
            json={"email": email, "full_name": key, "role": role, "password": password, "tenant_id": tenant["id"]},
        )
        assert res.status_code == 201, res.text
        users[key] = await login(client, email, password)

    yield {"su": su, "tag": tag, "tenant_a": tenant_a, "tenant_b": tenant_b, "model": model, **users}
    await _cleanup([tenant_a["id"], tenant_b["id"]], model["id"])


async def test_login_rejects_bad_password(client: httpx.AsyncClient) -> None:
    res = await client.post("/auth/login", json={"email": get_settings().seed_admin_email, "password": "wrong-password"})
    assert res.status_code == 401
    assert res.json()["detail"] == "อีเมลหรือรหัสผ่านไม่ถูกต้อง"


async def test_requires_token(client: httpx.AsyncClient) -> None:
    assert (await client.get("/devices")).status_code == 401


async def test_tenant_cannot_manage_device_models(client: httpx.AsyncClient, world: dict) -> None:
    res = await client.post("/device-models", headers=world["a"], json={"brand": "X", "name": "Y", "device_type": "Z"})
    assert res.status_code == 403


async def test_viewer_is_read_only(client: httpx.AsyncClient, world: dict) -> None:
    res = await client.post(
        "/inventory/check-in", headers=world["viewer"], json={"serial_number": "VIEW-1", "model_id": world["model"]["id"]}
    )
    assert res.status_code == 403


async def test_full_lifecycle_and_tenant_isolation(client: httpx.AsyncClient, world: dict) -> None:
    a, b, su = world["a"], world["b"], world["su"]
    serial = f"T-{world['tag']}-1"

    # Superadmin receives into central stock, then transfers to tenant A.
    res = await client.post("/inventory/check-in", headers=su, json={"serial_number": serial, "model_id": world["model"]["id"]})
    assert res.status_code == 201, res.text
    device = res.json()
    assert device["tenant_id"] is None and device["status"] == "IN_STOCK"

    # Central stock cannot be checked out.
    res = await client.post("/inventory/check-out", headers=su, json={"device_id": device["id"]})
    assert res.status_code == 409

    res = await client.post(
        "/inventory/transfer", headers=su, json={"device_id": device["id"], "target_tenant_id": world["tenant_a"]["id"]}
    )
    assert res.status_code == 200 and res.json()["tenant_name"] == world["tenant_a"]["name"]

    # Tenant B cannot see or move tenant A's device (Row-Level Security).
    assert (await client.get(f"/devices/{device['id']}", headers=b)).status_code == 404
    assert all(d["id"] != device["id"] for d in (await client.get("/devices", headers=b)).json())
    assert (await client.post("/inventory/check-out", headers=b, json={"device_id": device["id"]})).status_code == 404

    # Duplicate serial is rejected even though tenant A cannot see other tenants' rows.
    dup = await client.post("/inventory/check-in", headers=a, json={"serial_number": serial, "model_id": world["model"]["id"]})
    assert dup.status_code == 409

    customer = (await client.post("/customers", headers=a, json={"company_name": f"Cust {world['tag']}"})).json()
    assert customer["tenant_id"] == world["tenant_a"]["id"]

    # Install is only allowed after check-out.
    install_body = {
        "device_id": device["id"],
        "customer_id": customer["id"],
        "install_date": "2026-09-01",
        "latitude": 13.7563,
        "longitude": 100.5018,
        "address": "กรุงเทพฯ",
    }
    assert (await client.post("/installations", headers=a, json=install_body)).status_code == 409
    assert (await client.post("/inventory/check-out", headers=a, json={"device_id": device["id"]})).status_code == 200
    res = await client.post("/installations", headers=a, json=install_body)
    assert res.status_code == 201, res.text
    installation = res.json()

    # PostGIS nearby: ~1 km away finds it, the other side of the country does not.
    near = (await client.get("/installations/nearby", headers=a, params={"lat": 13.76, "lng": 100.51, "radius_m": 2000})).json()
    assert any(i["id"] == installation["id"] and i["distance_m"] < 2000 for i in near)
    far = (await client.get("/installations/nearby", headers=a, params={"lat": 18.79, "lng": 98.98, "radius_m": 2000})).json()
    assert all(i["id"] != installation["id"] for i in far)
    assert all(i["id"] != installation["id"] for i in (await client.get("/installations", headers=b)).json())

    # Return closes the installation and puts the device back in stock.
    res = await client.post("/inventory/return", headers=a, json={"device_id": device["id"], "note": "เสีย"})
    assert res.status_code == 200 and res.json()["status"] == "IN_STOCK"
    active = (await client.get("/installations", headers=a)).json()
    assert all(i["id"] != installation["id"] for i in active)

    history = (await client.get("/inventory/transactions", headers=a, params={"device_id": device["id"]})).json()
    assert [t["transaction_type"] for t in reversed(history)] == ["TRANSFER", "CHECK_OUT", "INSTALL", "RETURN"]
    su_history = (await client.get("/inventory/transactions", headers=su, params={"device_id": device["id"]})).json()
    assert su_history[-1]["transaction_type"] == "CHECK_IN"

    # Dashboard: 30 daily buckets ending today, with today's movements counted; B sees none of A's.
    summary = (await client.get("/dashboard/summary", headers=a)).json()
    activity = summary["activity_30d"]
    assert len(activity) == 30
    assert activity[-1]["counts"].get("INSTALL", 0) >= 1
    assert activity[-1]["total"] == sum(activity[-1]["counts"].values())
    assert summary["recent_transactions"][0]["device_id"] == device["id"]
    b_summary = (await client.get("/dashboard/summary", headers=b)).json()
    assert all(t["device_id"] != device["id"] for t in b_summary["recent_transactions"])


async def test_repair_flow(client: httpx.AsyncClient, world: dict) -> None:
    a, b, su = world["a"], world["b"], world["su"]
    res = await client.post(
        "/inventory/check-in",
        headers=su,
        json={"serial_number": f"R-{world['tag']}", "model_id": world["model"]["id"], "tenant_id": world["tenant_a"]["id"]},
    )
    assert res.status_code == 201, res.text
    device_id = res.json()["id"]
    customer = (await client.post("/customers", headers=a, json={"company_name": f"Repair {world['tag']}"})).json()
    assert (await client.post("/inventory/check-out", headers=a, json={"device_id": device_id})).status_code == 200
    install = await client.post(
        "/installations",
        headers=a,
        json={"device_id": device_id, "customer_id": customer["id"], "install_date": "2026-09-01", "latitude": 13.7, "longitude": 100.5},
    )
    assert install.status_code == 201, install.text

    # Tenant B cannot touch it; tenant A sends it for repair and the installation closes.
    assert (await client.post("/inventory/send-repair", headers=b, json={"device_id": device_id})).status_code == 404
    res = await client.post("/inventory/send-repair", headers=a, json={"device_id": device_id, "note": "จอไม่ติด"})
    assert res.status_code == 200 and res.json()["status"] == "IN_REPAIR"
    active = (await client.get("/installations", headers=a)).json()
    assert all(i["id"] != install.json()["id"] for i in active)

    # Cannot move while in repair, and QC result is required to finish.
    assert (await client.post("/inventory/check-out", headers=a, json={"device_id": device_id})).status_code == 409
    assert (await client.post("/inventory/send-repair", headers=a, json={"device_id": device_id})).status_code == 409
    empty_qc = await client.post("/inventory/repair-done", headers=a, json={"device_id": device_id, "qc_note": "   "})
    assert empty_qc.status_code == 422
    res = await client.post("/inventory/repair-done", headers=a, json={"device_id": device_id, "qc_note": "เปลี่ยนจอ ทดสอบผ่าน"})
    assert res.status_code == 200 and res.json()["status"] == "IN_STOCK"

    history = (await client.get("/inventory/transactions", headers=a, params={"device_id": device_id})).json()
    assert [t["transaction_type"] for t in history[:2]] == ["REPAIR_DONE", "SEND_REPAIR"]
    assert history[0]["note"] == "เปลี่ยนจอ ทดสอบผ่าน"
    assert history[1]["customer_name"] == customer["company_name"]


async def test_change_own_password(client: httpx.AsyncClient, world: dict) -> None:
    email = f"pw.{world['tag'].lower()}@example.com"
    old, new = "old-password-123", "new-password-456"
    res = await client.post(
        "/users",
        headers=world["su"],
        json={"email": email, "full_name": "pw", "role": "staff", "password": old, "tenant_id": world["tenant_a"]["id"]},
    )
    assert res.status_code == 201, res.text
    headers = await login(client, email, old)

    res = await client.post("/auth/change-password", headers=headers, json={"current_password": "wrong-pass", "new_password": new})
    assert res.status_code == 422
    assert res.json()["detail"] == "รหัสผ่านปัจจุบันไม่ถูกต้อง"
    res = await client.post("/auth/change-password", headers=headers, json={"current_password": old, "new_password": old})
    assert res.status_code == 422
    res = await client.post("/auth/change-password", headers=headers, json={"current_password": old, "new_password": "short"})
    assert res.status_code == 422

    res = await client.post("/auth/change-password", headers=headers, json={"current_password": old, "new_password": new})
    assert res.status_code == 204, res.text
    await login(client, email, new)
    assert (await client.post("/auth/login", json={"email": email, "password": old})).status_code == 401


async def test_tenant_admin_cannot_create_users_in_other_tenant(client: httpx.AsyncClient, world: dict) -> None:
    res = await client.post(
        "/users",
        headers=world["a"],
        json={
            "email": f"x.{world['tag'].lower()}@example.com",
            "full_name": "x",
            "role": "superadmin",
            "password": "long-enough-password",
        },
    )
    assert res.status_code == 403
