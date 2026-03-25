"""WebSocket connection manager with session-room routing.

Maintains a registry of active connections organised by session code.
Supports targeted broadcasting (all, gm, players, table, individual).
"""

import asyncio
import json
from typing import Optional
from fastapi import WebSocket
from datetime import datetime


class ConnectionManager:
    """Manages WebSocket connections organized by session rooms."""

    def __init__(self):
        # session_code -> {user_id: WebSocket}
        self.rooms: dict[str, dict[str, WebSocket]] = {}
        # session_code -> gm_user_id
        self.room_gms: dict[str, str] = {}
        # session_code -> set of table view connection user_ids
        self.room_tables: dict[str, set[str]] = {}
        # session_code -> bool (is halted)
        self.halted: dict[str, bool] = {}
        # session_code -> bool (attention mode)
        self.attention_mode: dict[str, bool] = {}
        # user_id -> session_code (reverse lookup)
        self.user_sessions: dict[str, str] = {}

    async def connect(self, websocket: WebSocket, session_code: str, user_id: str,
                      role: str = "player", is_table_view: bool = False):
        """Connect a client to a session room."""
        await websocket.accept()
        if session_code not in self.rooms:
            self.rooms[session_code] = {}
            self.room_tables[session_code] = set()
            self.halted[session_code] = False
            self.attention_mode[session_code] = False

        self.rooms[session_code][user_id] = websocket
        self.user_sessions[user_id] = session_code

        if role == "gm":
            self.room_gms[session_code] = user_id
        if is_table_view:
            self.room_tables[session_code].add(user_id)

    def disconnect(self, user_id: str):
        session_code = self.user_sessions.get(user_id)
        if session_code and session_code in self.rooms:
            self.rooms[session_code].pop(user_id, None)
            self.room_tables.get(session_code, set()).discard(user_id)
            if not self.rooms[session_code]:
                del self.rooms[session_code]
                self.room_gms.pop(session_code, None)
                self.room_tables.pop(session_code, None)
                self.halted.pop(session_code, None)
        self.user_sessions.pop(user_id, None)

    async def send_to_user(self, user_id: str, message: dict):
        session_code = self.user_sessions.get(user_id)
        if session_code and user_id in self.rooms.get(session_code, {}):
            ws = self.rooms[session_code][user_id]
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(user_id)

    async def broadcast_to_room(self, session_code: str, message: dict,
                                target: str = "all", exclude: str = None):
        """Broadcast with targeting:
        'all' - everyone
        'gm' - only GM
        'players' - all players (not GM, not table)
        'table' - table view connections only
        'gm_table' - GM + table views
        'player:{id}' - specific player
        """
        if session_code not in self.rooms:
            return

        room = self.rooms[session_code]
        gm_id = self.room_gms.get(session_code)
        table_ids = self.room_tables.get(session_code, set())

        targets = set()

        if target == "all":
            targets = set(room.keys())
        elif target == "gm":
            if gm_id:
                targets = {gm_id}
        elif target == "players":
            targets = {uid for uid in room.keys() if uid != gm_id and uid not in table_ids}
        elif target == "table":
            targets = table_ids & set(room.keys())
        elif target == "gm_table":
            targets = (table_ids & set(room.keys()))
            if gm_id:
                targets.add(gm_id)
        elif target.startswith("player:"):
            player_id = target.split(":", 1)[1]
            if player_id in room:
                targets = {player_id}

        if exclude:
            targets.discard(exclude)

        disconnected = []
        for uid in targets:
            try:
                await room[uid].send_json(message)
            except Exception:
                disconnected.append(uid)

        for uid in disconnected:
            self.disconnect(uid)

    def is_halted(self, session_code: str) -> bool:
        return self.halted.get(session_code, False)

    def set_halt(self, session_code: str, halted: bool):
        self.halted[session_code] = halted

    def is_attention(self, session_code: str) -> bool:
        return self.attention_mode.get(session_code, False)

    def set_attention(self, session_code: str, active: bool):
        self.attention_mode[session_code] = active

    def get_connected_users(self, session_code: str) -> list[str]:
        return list(self.rooms.get(session_code, {}).keys())

    def get_gm_id(self, session_code: str) -> Optional[str]:
        return self.room_gms.get(session_code)


manager = ConnectionManager()
