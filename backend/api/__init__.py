"""AventuriaVTT REST API — all routers."""

from api.auth import router as auth_router
from api.characters import router as characters_router
from api.campaigns import router as campaigns_router
from api.sessions import router as sessions_router
from api.combat import router as combat_router
from api.probes import router as probes_router
from api.inventory import router as inventory_router
from api.maps import router as maps_router
from api.databank import router as databank_router
from api.adventures import router as adventures_router
from api.assist import router as assist_router
from api.npcs import router as npcs_router

all_routers = [
    auth_router,
    characters_router,
    campaigns_router,
    sessions_router,
    combat_router,
    probes_router,
    inventory_router,
    maps_router,
    databank_router,
    adventures_router,
    assist_router,
    npcs_router,
]

__all__ = ["all_routers"]
