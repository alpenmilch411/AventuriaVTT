"""Typed event definitions for WebSocket communication.

Every message flowing through the WebSocket layer is an instance of WSMessage.
EventType enumerates every possible event; BroadcastTarget controls routing.
"""

from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime, timezone
from enum import Enum


class EventType(str, Enum):
    # GM Commands
    COMBAT_START = "combat_start"
    COMBAT_END = "combat_end"
    COMBAT_NEXT_TURN = "combat_next_turn"
    PROBE_REQUEST = "probe_request"
    GROUP_PROBE_REQUEST = "group_probe_request"
    OPPOSED_PROBE_REQUEST = "opposed_probe_request"
    OPPOSED_PROBE_RESULT = "opposed_probe_result"
    WHISPER = "whisper"
    HALT = "halt"
    HALT_RELEASE = "halt_release"
    HANDOUT_PUSH = "handout_push"
    TIME_ADVANCE = "time_advance"
    WEATHER_CHANGE = "weather_change"
    ATTENTION = "attention"
    ATTENTION_RELEASE = "attention_release"
    REST_START = "rest_start"
    REST_END = "rest_end"
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
    ITEM_USE = "item_use"
    ITEM_TRANSFER = "item_transfer"
    SPELL_CAST = "spell_cast"

    # State Updates (server → clients)
    STATE_UPDATE = "state_update"
    VITALS_UPDATE = "vitals_update"
    CONDITIONS_UPDATE = "conditions_update"
    CONDITION_CHANGE = "condition_change"
    INITIATIVE_UPDATE = "initiative_update"
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

    # Schicksalspunkte (SchiP)
    SCHIP_USE = "schip_use"
    SCHIP_USED = "schip_used"
    SCHIP_ERROR = "schip_error"

    # Buffs
    BUFF_APPLY = "buff_apply"
    BUFF_REMOVE = "buff_remove"
    BUFF_APPLIED = "buff_applied"
    BUFF_REMOVED = "buff_removed"
    BUFF_EDIT = "buff_edit"
    BUFF_EDITED = "buff_edited"
    BUFF_CLEAR_EXPIRED = "buff_clear_expired"
    BUFF_EXPIRED = "buff_expired"

    # Loot
    LOOT_DISPLAY = "loot_display"
    LOOT_DISTRIBUTE = "loot_distribute"

    # Shop / Merchant
    SHOP_CREATE = "shop_create"
    SHOP_UPDATE = "shop_update"
    SHOP_CLOSE = "shop_close"
    SHOP_BUY = "shop_buy"
    SHOP_SELL = "shop_sell"
    SHOP_STATE = "shop_state"

    # Character lifecycle
    CHARACTER_DEATH = "character_death"

    # Session Control
    SESSION_START = "session_start"
    SESSION_PAUSE = "session_pause"
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
            self.timestamp = datetime.now(timezone.utc)
