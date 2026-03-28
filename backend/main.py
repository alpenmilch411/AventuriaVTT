import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from config import get_settings
from ws.manager import manager
from ws.handlers import handle_message, handle_connect, handle_disconnect

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Aventuria VTT",
    description="Virtual Tabletop for Das Schwarze Auge 5th Edition",
    version="1.0.0",
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
    return {"status": "ok", "app": "Aventuria VTT"}


@app.websocket("/ws/{session_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_code: str,
    user_id: str = Query(...),
    role: str = Query(default="player"),
    is_table_view: bool = Query(default=False),
):
    import logging
    logger = logging.getLogger("aventuria.ws")

    await manager.connect(websocket, session_code, user_id, role, is_table_view)
    logger.info(f"WS connected: {user_id} as {role} to {session_code}")
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
                logger.debug(f"WS message from {user_id}: {msg_type}")
            await handle_message(websocket, user_id, session_code, message)
    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {user_id}")
        await handle_disconnect(session_code, user_id)
    except Exception as e:
        logger.error(f"WS error for {user_id}: {e}", exc_info=True)
        manager.disconnect(user_id)
        await handle_disconnect(session_code, user_id)
