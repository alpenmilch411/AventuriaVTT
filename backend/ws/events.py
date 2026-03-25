"""Typed event definitions for WebSocket communication.

Every message flowing through the WebSocket layer is an instance of WSMessage.
EventType enumerates every possible event; BroadcastTarget controls routing.
"""

from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from enum import Enum


class EventType(str, Enum):
    # GM Commands
    SCENE_ACTIVATE = "scene_activate"
    COMBAT_START = "combat_start"
    COMBAT_END = "combat_end"
    COMBAT_NEXT_TURN = "combat_next_turn"
    PROBE_REQUEST = "probe_request"
    GROUP_PROBE_REQUEST = "group_probe_request"
    WHISPER = "whisper"
    HALT = "halt"
    HALT_RELEASE = "halt_release"
    TOKEN_SPAWN = "token_spawn"
    TOKEN_REMOVE = "token_remove"
    FOG_UPDATE = "fog_update"
    HANDOUT_PUSH = "handout_push"
    TIME_ADVANCE = "time_advance"
    WEATHER_CHANGE = "weather_change"
    SOUND_PLAY = "sound_play"
    ATTENTION = "attention"
    ATTENTION_RELEASE = "attention_release"
    AP_AWARD = "ap_award"
    QUEST_UPDATE = "quest_update"
    LORE_REVEAL = "lore_reveal"
    SPOTLIGHT = "spotlight"
    SPOTLIGHT_RELEASE = "spotlight_release"
    TABLE_VIEW_MODE = "table_view_mode"

    # Trade / Transfer
    TRADE_PROPOSE = "trade_propose"
    TRADE_ACCEPT = "trade_accept"
    TRADE_DECLINE = "trade_decline"
    TRADE_CANCEL = "trade_cancel"
    TRADE_COMPLETE = "trade_complete"
    TRADE_COUNTER = "trade_counter"
    TRADE_GM_REQUEST = "trade_gm_request"
    TRADE_APPROVED = "trade_approved"
    TRADE_REJECTED = "trade_rejected"
    TRANSFER_REQUEST = "transfer_request"
    TRANSFER_APPROVED = "transfer_approved"
    TRANSFER_REJECTED = "transfer_rejected"
    INVENTORY_UPDATE = "inventory_update"

    # Player Actions
    ACTION_DECLARE = "action_declare"
    DICE_RESULT = "dice_result"
    DEFENSE_CHOICE = "defense_choice"
    MOVE_REQUEST = "move_request"
    ITEM_USE = "item_use"
    ITEM_TRANSFER = "item_transfer"
    SCHIP_USE = "schip_use"
    SPELL_CAST = "spell_cast"
    LITURGY_CAST = "liturgy_cast"
    WHISPER_REPLY = "whisper_reply"

    # State Updates (server → clients)
    STATE_UPDATE = "state_update"
    VITALS_UPDATE = "vitals_update"
    CONDITIONS_UPDATE = "conditions_update"
    CONDITION_CHANGE = "condition_change"
    INITIATIVE_UPDATE = "initiative_update"
    TOKEN_MOVE = "token_move"
    INVENTORY_CHANGE = "inventory_change"
    COMBAT_LOG_ENTRY = "combat_log_entry"
    DICE_REQUEST = "dice_request"
    DEFENSE_REQUEST = "defense_request"
    PROBE_RESULT = "probe_result"

    # Action flow (GM ↔ Player)
    ACTION_REQUEST = "action_request"
    PROBE_REQUEST_FROM_PLAYER = "probe_request_from_player"
    SPELL_CAST_REQUEST = "spell_cast_request"
    ACTION_APPROVED = "action_approved"
    ACTION_DECLINED = "action_declined"
    ITEM_TRANSFERRED = "item_transferred"

    # Loot
    LOOT_DISPLAY = "loot_display"
    LOOT_DISTRIBUTE = "loot_distribute"

    # Session Control
    SESSION_START = "session_start"
    SESSION_PAUSE = "session_pause"
    SESSION_RESUME = "session_resume"
    SESSION_END = "session_end"
    PLAYER_CONNECTED = "player_connected"
    PLAYER_DISCONNECTED = "player_disconnected"
    PLAYER_RECONNECTED = "player_reconnected"

    # Unified Session Log
    SESSION_LOG_ENTRY = "session_log_entry"

    # System
    ERROR = "error"
    SYNC_FULL = "sync_full"
    PING = "ping"
    PONG = "pong"


class BroadcastTarget(str, Enum):
    ALL = "all"
    GM = "gm"
    PLAYERS = "players"
    TABLE = "table"
    GM_AND_TABLE = "gm_table"


class WSMessage(BaseModel):
    type: EventType
    from_user: Optional[str] = None
    target: str = "all"  # BroadcastTarget or "player:{id}"
    payload: dict = {}
    timestamp: datetime = None

    def model_post_init(self, __context):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()
