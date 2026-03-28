import json
import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, async_session
from config import get_settings
from ws.manager import manager
from ws.handlers import handle_message, handle_connect, handle_disconnect

settings = get_settings()
logger = logging.getLogger("aventuria.app")

APP_VERSION = "2.4.0"
_start_time: float = 0.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _start_time
    await init_db()
    await _validate_seed_data()
    _start_time = time.time()
    yield


app = FastAPI(
    title="Aventuria VTT",
    description="Virtual Tabletop for Das Schwarze Auge 5th Edition",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all REST routers
from api import all_routers
for router in all_routers:
    app.include_router(router)


@app.get("/api/health")
async def health():
    from sqlalchemy import select, func, text
    from models.user import User

    db_ok = False
    entity_count = 0
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
            db_ok = True
            result = await db.execute(select(func.count(User.id)))
            entity_count = result.scalar() or 0
    except Exception as e:
        logger.warning("Health check DB probe failed: %s", e)

    return {
        "status": "ok",
        "version": APP_VERSION,
        "app": "Aventuria VTT",
        "db_connected": db_ok,
        "entity_count": entity_count,
        "uptime_seconds": round(time.time() - _start_time, 1) if _start_time else 0,
    }


async def _validate_seed_data():
    """Post-migration sanity check: warn if databank tables are empty."""
    from sqlalchemy import select, func
    from models.databank import SpellTemplate, SpecialAbilityTemplate, CombatTechniqueTemplate

    tables = {
        "spell_templates": SpellTemplate,
        "special_ability_templates": SpecialAbilityTemplate,
        "combat_technique_templates": CombatTechniqueTemplate,
    }
    try:
        async with async_session() as db:
            for name, model in tables.items():
                result = await db.execute(select(func.count(model.id)))
                count = result.scalar() or 0
                if count == 0:
                    logger.warning(
                        "Databank table '%s' is empty — run 'python -m databank.seed' to populate reference data",
                        name,
                    )
                else:
                    logger.info("Databank '%s': %d entries", name, count)
    except Exception as e:
        logger.warning("Seed validation failed (table may not exist yet): %s", e)


@app.websocket("/ws/{session_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_code: str,
    user_id: str = Query(...),
    role: str = Query(default="player"),
    is_table_view: bool = Query(default=False),
):
    ws_logger = logging.getLogger("aventuria.ws")

    await manager.connect(websocket, session_code, user_id, role, is_table_view)
    ws_logger.info(f"WS connected: {user_id} as {role} to {session_code}")
    await handle_connect(session_code, user_id, role, is_table_view)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "payload": {"message": "Invalid JSON"}})
                continue

            msg_type = message.get("type", "?")
            if msg_type != "ping":
                ws_logger.debug(f"WS message from {user_id}: {msg_type}")
            await handle_message(websocket, user_id, session_code, message)
    except WebSocketDisconnect:
        ws_logger.info(f"WS disconnected: {user_id}")
        await handle_disconnect(session_code, user_id)
    except Exception as e:
        ws_logger.error(f"WS error for {user_id}: {e}", exc_info=True)
        manager.disconnect(user_id)
        await handle_disconnect(session_code, user_id)
