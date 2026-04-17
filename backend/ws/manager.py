"""WebSocket connection manager with session-room routing.

Maintains a registry of active connections organised by session code.
Supports targeted broadcasting (all, gm, players, individual).
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
        # session_code -> bool (is halted)
        self.halted: dict[str, bool] = {}
        # session_code -> bool (attention mode)
        self.attention_mode: dict[str, bool] = {}
        # user_id -> session_code (reverse lookup)
        self.user_sessions: dict[str, str] = {}
        # Dead letter queue: user_id -> [messages] (max 50 per user)
        self._dead_letters: dict[str, list[dict]] = {}
        self._DLQ_MAX = 50

    async def connect(self, websocket: WebSocket, session_code: str, user_id: str,
                      role: str = "player"):
        """Connect a client to a session room."""
        await websocket.accept()
        if session_code not in self.rooms:
            self.rooms[session_code] = {}
            self.halted[session_code] = False
            self.attention_mode[session_code] = False

        self.rooms[session_code][user_id] = websocket
        self.user_sessions[user_id] = session_code

        if role == "gm":
            self.room_gms[session_code] = user_id

    def disconnect(self, user_id: str):
        session_code = self.user_sessions.get(user_id)
        if session_code and session_code in self.rooms:
            self.rooms[session_code].pop(user_id, None)
            if not self.rooms[session_code]:
                del self.rooms[session_code]
                self.room_gms.pop(session_code, None)
                self.halted.pop(session_code, None)
                self.attention_mode.pop(session_code, None)
                # Clean up in-memory session state to prevent memory leak
                from ws.handlers import cleanup_session_state
                cleanup_session_state(session_code)
        self.user_sessions.pop(user_id, None)

    async def send_to_user(self, user_id: str, message: dict):
        session_code = self.user_sessions.get(user_id)
        if session_code and user_id in self.rooms.get(session_code, {}):
            ws = self.rooms[session_code][user_id]
            try:
                await ws.send_json(message)
            except Exception:
                self._enqueue_dead_letter(user_id, message)
                self.disconnect(user_id)
        else:
            # User not connected — queue for when they reconnect
            self._enqueue_dead_letter(user_id, message)

    async def broadcast_to_room(self, session_code: str, message: dict,
                                target: str = "all", exclude: str = None):
        """Broadcast with targeting:
        'all' - everyone
        'gm' - only GM
        'players' - all players (not GM)
        'player:{id}' - specific player
        """
        if session_code not in self.rooms:
            return

        room = self.rooms[session_code]
        gm_id = self.room_gms.get(session_code)

        targets = set()

        if target == "all":
            targets = set(room.keys())
        elif target == "gm":
            if gm_id:
                targets = {gm_id}
        elif target == "players":
            targets = {uid for uid in room.keys() if uid != gm_id}
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
                self._enqueue_dead_letter(uid, message)
                disconnected.append(uid)

        for uid in disconnected:
            self.disconnect(uid)

    def _enqueue_dead_letter(self, user_id: str, message: dict):
        """Queue a message that couldn't be delivered for later retry."""
        queue = self._dead_letters.setdefault(user_id, [])
        if len(queue) < self._DLQ_MAX:
            queue.append(message)

    async def flush_dead_letters(self, user_id: str):
        """Send any queued messages to a reconnected user, then clear the queue."""
        queue = self._dead_letters.pop(user_id, [])
        for msg in queue:
            try:
                session_code = self.user_sessions.get(user_id)
                if session_code and user_id in self.rooms.get(session_code, {}):
                    await self.rooms[session_code][user_id].send_json(msg)
            except Exception:
                break  # Connection failed again, stop flushing

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
