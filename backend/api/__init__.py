"""AventuriaVTT REST API — all routers."""

from api.auth import router as auth_router
from api.characters import router as characters_router
from api.campaigns import router as campaigns_router
from api.sessions import router as sessions_router
from api.inventory import router as inventory_router
from api.databank import router as databank_router

all_routers = [
    auth_router,
    characters_router,
    campaigns_router,
    sessions_router,
    inventory_router,
    databank_router,
]

__all__ = ["all_routers"]
