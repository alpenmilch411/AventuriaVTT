"""Seed a complete demo adventure into the 'ORKTURM-42' campaign.

Run AFTER seed.py (depends on existing users, characters, and the campaign).

Usage:
    python -m databank.seed_adventure
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from config import get_settings  # noqa: E402
from database import Base  # noqa: E402
from models.adventure import Adventure, Chapter, Scene  # noqa: E402
from models.campaign import Campaign, CampaignPlayer, Quest, LoreEntry, TimelineEvent  # noqa: E402
from models.map import GameMap, MapToken, MapTrigger, FogState  # noqa: E402
from models.npc import NPC  # noqa: E402
from models.session_state import GameSession, CombatState, SessionLog  # noqa: E402

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("databank.seed_adventure")


# ===========================================================================
# Helper
# ===========================================================================
def _id() -> str:
    return str(uuid4())


# ===========================================================================
# Main seed function
# ===========================================================================
def seed_adventure(database_url: str | None = None) -> dict[str, int]:
    """Populate the ORKTURM-42 campaign with a full demo adventure."""

    settings = get_settings()
    url = database_url or settings.DATABASE_URL_SYNC
    log.info("Connecting to database: %s", url)

    engine = create_engine(url, echo=False)

    if "sqlite" in url:
        @sa_event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    Base.metadata.create_all(engine, checkfirst=True)

    counts: dict[str, int] = {
        "adventures": 0,
        "chapters": 0,
        "scenes": 0,
        "npcs": 0,
        "maps": 0,
        "tokens": 0,
        "triggers": 0,
        "fog_states": 0,
        "quests": 0,
        "lore_entries": 0,
        "timeline_events": 0,
        "game_sessions": 0,
        "session_logs": 0,
    }

    with Session(engine) as session:
        # ------------------------------------------------------------------
        # 1. Find the existing campaign
        # ------------------------------------------------------------------
        campaign = session.query(Campaign).filter_by(campaign_code="ORKTURM-42").first()
        if campaign is None:
            log.error("Campaign ORKTURM-42 not found. Run seed.py first!")
            return counts

        campaign_id = str(campaign.id)
        gm_id = str(campaign.gm_user_id)
        log.info("Found campaign '%s' (id=%s)", campaign.name, campaign_id)

        # Idempotency check
        existing_adventure = (
            session.query(Adventure)
            .filter_by(title="Der Turm des Orkschamanen")
            .first()
        )
        if existing_adventure:
            log.info("Adventure 'Der Turm des Orkschamanen' already exists — skipping.")
            return counts

        # ==================================================================
        # 2. CREATE ADVENTURE
        # ==================================================================
        adventure_id = _id()
        adventure = Adventure(
            id=adventure_id,
            title="Der Turm des Orkschamanen",
            description=(
                "Ein klassisches DSA5-Abenteuer im Mittelreich nahe Gareth. "
                "Die Helden folgen dem Hilferuf eines Koehlers und muessen den Turm eines "
                "maechtig gewordenen Orkschamanen infiltrieren, um das gestohlene Schwert "
                "des Koenigs zurueckzubringen. Auf dem Weg dorthin decken sie ein Banditen-Netzwerk "
                "auf und begegnen uralter Magie an einem verfallenen Wegschrein."
            ),
            author="Aventuria VTT Demo",
            difficulty="mittel",
            player_count="3-5",
            estimated_duration="3-4 Sitzungen",
            setting="Mittelreich, nahe Gareth",
            source="original",
            tags=["demo", "ork", "dungeon", "mittelreich", "einsteiger"],
            created_by=gm_id,
        )
        session.add(adventure)
        counts["adventures"] += 1

        # Link adventure to campaign
        campaign.adventure_id = adventure_id

        # ==================================================================
        # 3. CREATE NPCs  (need IDs before scenes reference them)
        # ==================================================================
        npc_gregor_id = _id()
        npc_koehler_id = _id()
        npc_rondrik_id = _id()
        npc_grashnak_id = _id()
        npc_urruk_id = _id()
        npc_praxus_id = _id()
        npc_wache_id = _id()
        npc_alenia_id = _id()

        npcs_data = [
            NPC(
                id=npc_gregor_id,
                campaign_id=campaign_id,
                adventure_id=adventure_id,
                name="Gregor der Wirt",
                icon_id="innkeeper",
                personality_tags=["nervoes", "freundlich", "ausweichend", "familiaer"],
                voice_notes=(
                    "Spricht mit leichtem Garether Dialekt, wischt staendig die Haende an seiner "
                    "Schuerze ab. Wird hektisch, wenn das Gespraech auf den Nordpfad kommt. "
                    "Rauespert sich oft, bevor er antwortet."
                ),
                knows=[
                    "Sein Bruder Rondrik fuehrt die Bande auf dem Nordpfad",
                    "Der Koehler Alrik kommt regelmaessig in die Taverne",
                    "Orks wurden in der Naehe des alten Turms gesehen",
                    "Das Schwert des Koenigs wurde vor drei Wochen gestohlen",
                    "Reisende, die den Nordpfad nehmen, werden ausgeraubt",
                ],
                secrets=[
                    "Gregor schickt ahnungslose Reisende zum Nordpfad, wo Rondrik sie ueberfaellt",
                    "Er erhaelt einen Anteil der Beute als Schweigegeld",
                    "Er hat Angst vor Rondrik und wuerde ihn verraten, wenn er sich sicher fuehlt",
                    "Hinter der Theke gibt es eine Geheimtuer zum Keller, wo Beute gelagert wird",
                ],
                attitude_to_party="neutral",
                relationships=[
                    {"npc_id": npc_rondrik_id, "type": "Bruder", "description": "Angstvolles Verhaeltnis, Rondrik dominiert"},
                    {"npc_id": npc_koehler_id, "type": "Bekannter", "description": "Stammgast in der Taverne"},
                ],
                location="Taverne zum Goldenen Keiler",
                is_combatant=False,
                tags=["questgeber", "verdaechtig", "taverne", "mittelreich"],
                gm_notes=(
                    "Gregor ist der Schluessel zur Nebenquest 'Rondriks Bande'. Wenn die Helden ihn "
                    "unter Druck setzen (Einschuechtern erschwert um 1 oder Menschenkenntnis), gibt "
                    "er zu, dass sein Bruder die Banditen anfuehrt. Er kann auch verraten, wo die "
                    "Beute gelagert ist (Keller unter der Taverne). Bei einer gelungenen Ueberreden-Probe "
                    "bittet er die Helden, Rondrik lebend zu fassen — er will nicht, dass sein Bruder stirbt."
                ),
                known_to_players=True,
                player_visible_info=(
                    "Der Wirt der Taverne zum Goldenen Keiler. Ein staemmiger Mann mittleren Alters "
                    "mit schmalem Schnurrbart und nervoeser Art. Er scheint freundlich, aber irgendetwas "
                    "beunruhigt ihn sichtlich."
                ),
            ),
            NPC(
                id=npc_koehler_id,
                campaign_id=campaign_id,
                adventure_id=adventure_id,
                name="Alrik der Koehler",
                icon_id="peasant",
                personality_tags=["veraengstigt", "mutig", "ehrlich", "naturverbunden"],
                voice_notes=(
                    "Spricht einfach und direkt, mit rauer Stimme eines Waldarbeiters. "
                    "Stammelt vor Aufregung, wenn er von den Orks erzaehlt. "
                    "Hat einen beruhigenden Tonfall, wenn er ueber den Wald spricht."
                ),
                knows=[
                    "Der genaue Weg zum Turm des Orkschamanen",
                    "Es gibt einen geheimen Eingang auf der Rueckseite des Turms",
                    "Die Orks fuehren nachts Rituale auf der Turmspitze durch",
                    "Im Wald leben Woelfe, die durch die Ork-Praesenz aggressiver geworden sind",
                    "Am Wegschrein der Peraine gibt es seltsame magische Spuren",
                    "Seine Ziegen sind verschwunden — wahrscheinlich von Banditen gestohlen",
                ],
                secrets=[
                    "Er hat den Orkschamanen aus der Ferne beobachtet und dabei ein altes Ritual gesehen",
                    "Er weiss von einem unterirdischen Gang, der vom Waldrand zum Turmkeller fuehrt",
                ],
                attitude_to_party="freundlich",
                relationships=[
                    {"npc_id": npc_gregor_id, "type": "Stammgast", "description": "Trinkt regelmaessig in der Taverne"},
                ],
                location="Taverne zum Goldenen Keiler / Dunkelwald",
                is_combatant=False,
                tags=["questgeber", "guide", "wald", "mittelreich"],
                gm_notes=(
                    "Alrik ist der wichtigste Questgeber und kann als Fuehrer dienen. Er verlangt "
                    "10 Silbertaler fuer seine Dienste (verhandelbar auf 5 bei Ueberreden). Als Fuehrer "
                    "gibt er +2 auf Wildnisleben-Proben im Dunkelwald. Er kaempft nicht, flieht aber "
                    "auch nicht sofort. Wenn die Helden seine Ziegen finden, fuehrt er sie kostenlos."
                ),
                known_to_players=True,
                player_visible_info=(
                    "Ein drahtiger Mann mit wettergegerbtem Gesicht und russgeschwärzten Haenden. "
                    "Er lebt als Koehler im Dunkelwald und kennt jeden Pfad. Trotz seiner Angst vor "
                    "den Orks ist er bereit, den Helden den Weg zum Turm zu zeigen."
                ),
            ),
            NPC(
                id=npc_rondrik_id,
                campaign_id=campaign_id,
                adventure_id=adventure_id,
                name="Rondrik der Bandit",
                icon_id="bandit_leader",
                personality_tags=["charismatisch", "skrupellos", "gerissen", "grossspurig"],
                voice_notes=(
                    "Spricht mit einer ueberraschend kultivierten Stimme fuer einen Banditen. "
                    "Lacht oft und laut. Droht mit leiser, kontrollierter Stimme. "
                    "Nennt jeden 'Freund', auch seine Opfer."
                ),
                knows=[
                    "Gregor hilft ihm, Reisende auf den Nordpfad zu locken",
                    "Der Orkschamane ist gefaehrlich — Rondrik meidet den Turm",
                    "Ein Haendler namens Praxus wurde von den Orks gefangen genommen",
                    "Das Schwert des Koenigs ist im Turm — aber Rondrik traut sich nicht hinein",
                ],
                secrets=[
                    "Rondrik war frueher Soldat im Garether Heer und desertiert",
                    "Er hat eine Belohnung auf seinen Kopf: 50 Dukaten",
                    "Er plant, die Gegend zu verlassen, sobald er genug Gold hat",
                ],
                attitude_to_party="feindlich",
                relationships=[
                    {"npc_id": npc_gregor_id, "type": "Bruder", "description": "Nutzt Gregor aus, hat aber auch Zuneigung"},
                ],
                location="Nordpfad / Banditenlager",
                is_combatant=True,
                creature_template_id="bandit_leader",
                tags=["antagonist", "bandit", "kampf", "nebenquest"],
                gm_notes=(
                    "Rondrik kann als Banditenanfuehrer oder mit den Werten eines erfahrenen Kaempfers "
                    "gespielt werden. AT 14, PA 10, LeP 32, RS 3. Bewaffnet mit Langschwert und "
                    "Lederharnisch. Er ergibt sich, wenn er unter 8 LeP faellt, und bietet "
                    "Informationen ueber den Turm im Austausch fuer sein Leben. Wenn er gefangen "
                    "wird, kann er nach Gareth gebracht werden (Belohnung: 50 Dukaten)."
                ),
                known_to_players=False,
                player_visible_info=(
                    "Ein hochgewachsener Mann mit kurzem dunklem Haar und einem Narbengesicht. "
                    "Er traegt einen abgenutzten Lederharnisch und fuehrt ein gut gepflegtes Langschwert."
                ),
            ),
            NPC(
                id=npc_grashnak_id,
                campaign_id=campaign_id,
                adventure_id=adventure_id,
                name="Orkschamane Grashnak",
                icon_id="orc_shaman",
                personality_tags=["machtbesessen", "intelligent", "grausam", "fanatisch"],
                voice_notes=(
                    "Spricht gebrochenes Garethi mit tiefer, grollender Stimme. Rezitiert "
                    "Orkische Beschwörungen in einem singenden Tonfall. Lacht hoehnisch, "
                    "wenn er seine Feinde verhöhnt. Spricht von sich selbst in der dritten Person: "
                    "'Grashnak sieht euch. Grashnak wird euch vernichten.'"
                ),
                knows=[
                    "Das Schwert des Koenigs hat magische Eigenschaften, die er nutzen will",
                    "Der Wegschrein der Peraine blockiert teilweise seine Magie",
                    "Er hat Kontakt zu einem Orkstamm im Norden, der Verstaerkung schicken soll",
                    "Im Turm gibt es alte zwergische Artefakte, die er studiert",
                ],
                secrets=[
                    "Grashnak war einst ein Schüler eines menschlichen Magiers, bevor er verbannt wurde",
                    "Das Schwert des Koenigs enthaelt einen gebundenen Elementar",
                    "Grashnaks Macht kommt teilweise von einem Pakt mit einem Daemonen",
                    "Er plant, mit dem Schwert ein Portal in die Niedere Daemonensphäre zu öffnen",
                ],
                attitude_to_party="feindlich",
                relationships=[
                    {"npc_id": npc_urruk_id, "type": "Untergebener", "description": "Urruk ist sein treuester Krieger"},
                ],
                location="Turm des Orkschamanen, Turmspitze",
                is_combatant=True,
                creature_template_id="orkschamane",
                tags=["hauptantagonist", "boss", "magier", "ork"],
                gm_notes=(
                    "BOSS-KAMPF: Grashnak hat LeP 38, AsP 45, RS 2 (magische Robe). "
                    "Zauber: Horriphobus (Angst erzeugen), Corpofesso (Schmerzen), Ignifaxius (Feuerstrahl), "
                    "Paralysis (Laehmen). Er wirkt in Runde 1 Horriphobus auf den staerksten Kaempfer, "
                    "dann Corpofesso. Wenn er unter 15 LeP faellt, versucht er Paralysis auf alle und "
                    "will fliehen. Das Schwert des Koenigs liegt auf dem Altar hinter ihm. "
                    "Stufe: Erfahren. INI 12+1W6."
                ),
                known_to_players=False,
                player_visible_info=(
                    "Ein massiger Ork in einer dunklen, mit Knochen verzierten Robe. "
                    "Seine Augen gluehen in einem unnatuerlichen Rot, und um seine Klauen "
                    "tanzen Funken arkaner Energie. Er strahlt eine Aura der Furcht aus."
                ),
            ),
            NPC(
                id=npc_urruk_id,
                campaign_id=campaign_id,
                adventure_id=adventure_id,
                name="Orkhauptling Urruk",
                icon_id="orc_chief",
                personality_tags=["brutal", "loyal", "stumm", "einschüchternd"],
                voice_notes=(
                    "Spricht fast nie. Wenn er spricht, dann nur einzelne Worte oder kurze "
                    "Saetze in gebrochenem Garethi: 'Sterben. Jetzt.' oder 'Grashnak befehlen. "
                    "Urruk toeten.' Grosse, schwere Atemzuege."
                ),
                knows=[
                    "Grashnak plant etwas Grosses mit dem Schwert",
                    "Im Keller des Turms sind Gefangene, die fuer Rituale gebraucht werden",
                    "Die Wachen wechseln alle vier Stunden",
                ],
                secrets=[
                    "Urruk traegt eine alte zwergische Streitaxt — moeglicherweise die von Balgras Vater",
                    "Er hat heimlich Zweifel an Grashnaks Daemonenmagie",
                ],
                attitude_to_party="feindlich",
                relationships=[
                    {"npc_id": npc_grashnak_id, "type": "Anfuehrer", "description": "Dient Grashnak aus Loyalitaet und Furcht"},
                ],
                location="Turm des Orkschamanen, Turmspitze",
                is_combatant=True,
                creature_template_id="orkkrieger",
                tags=["antagonist", "boss", "krieger", "ork"],
                gm_notes=(
                    "Urruk ist der Bodyguard des Schamanen. LeP 42, AT 15, PA 9, RS 4 (schwere Rüstung), "
                    "TP 1W6+6 (Zwergische Streitaxt). Er kaempft bis zum Tod, es sei denn, Grashnak "
                    "faellt — dann ergibt er sich mit einem Knurren. Die Streitaxt, die er traegt, "
                    "ist Balgras Vaters Waffe 'Gramzorn'. Wenn Balgra sie sieht (Sinnesschaerfe +2), "
                    "erkennt er die Runen. INI 11+1W6. Besonderheit: Wuchtschlag bei jedem Angriff."
                ),
                known_to_players=False,
                player_visible_info=(
                    "Ein gewaltiger Ork, fast zwei Schritt gross, in schwerer Plattenrüstung. "
                    "Er traegt eine auffaellig kunstvoll gearbeitete Streitaxt mit zwergischen Runen."
                ),
            ),
            NPC(
                id=npc_praxus_id,
                campaign_id=campaign_id,
                adventure_id=adventure_id,
                name="Haendler Praxus",
                icon_id="merchant",
                personality_tags=["verängstigt", "dankbar", "gebildet", "redselig"],
                voice_notes=(
                    "Spricht hastig und atemlos, als haette er Angst, unterbrochen zu werden. "
                    "Verwendet blumige, umstaendliche Formulierungen — ein gebildeter Mann. "
                    "Weint vor Erleichterung, wenn er befreit wird."
                ),
                knows=[
                    "Das Schwert des Koenigs ist ein uraltes Artefakt aus der Bosparanischen Aera",
                    "Grashnak hat das Schwert von einem Kurier des Koenigs gestohlen",
                    "Die Orks planen ein grosses Ritual bei Vollmond (in 3 Tagen)",
                    "Es gibt eine Schatzkammer im Turm mit Gold und Waffen",
                    "Der Turm hat fruher einem zwergischen Schmied gehört",
                ],
                secrets=[
                    "Praxus ist eigentlich ein Agent des Koenigs, der das Schwert zurueckholen sollte",
                    "Er kennt das Geheimnis des Schwertes: Es kann Daemonen bannen",
                ],
                attitude_to_party="freundlich",
                relationships=[],
                location="Turm des Orkschamanen, Folterkammer",
                is_combatant=False,
                tags=["gefangener", "informant", "quest", "rettung"],
                gm_notes=(
                    "Praxus sitzt in der Folterkammer im Erdgeschoss des Turms. Er hat 8 LeP "
                    "(von 26 max) und den Zustand Schmerz II. Wenn er befreit wird, erzaehlt er "
                    "alles, was er weiss. Er bietet 20 Dukaten Belohnung fuer seine Rettung und "
                    "das Schwert. Wenn die Helden erfahren, dass er ein Koenigsagent ist, kann "
                    "er die Belohnung auf 50 Dukaten erhoehen. Er kann nicht kaempfen."
                ),
                known_to_players=False,
                player_visible_info=(
                    "Ein hagerer Mann in zerrissener Kleidung, der offensichtlich gefoltert wurde. "
                    "Trotz seiner Verletzungen zeigt sein Blick Intelligenz und Entschlossenheit."
                ),
            ),
            NPC(
                id=npc_wache_id,
                campaign_id=campaign_id,
                adventure_id=adventure_id,
                name="Wache am Tor",
                icon_id="orc_guard",
                personality_tags=["gelangweilt", "bestechlich", "feige", "muede"],
                voice_notes=(
                    "Gaehnt staendig. Murrt in einer Mischung aus Orkisch und gebrochenem Garethi. "
                    "'Was wollen? Gehen weg oder Urruk rufen!' Klingt mehr genervt als bedrohlich."
                ),
                knows=[
                    "Der Dienstplan der Wachen",
                    "Grashnak ist oben im Turm und darf nicht gestört werden",
                    "Im Erdgeschoss gibt es Fallen",
                    "Die Gefangenen sind im hinteren Raum",
                ],
                secrets=[
                    "Die Wache hat heimlich Menschenbier von Rondrik gekauft",
                    "Sie wuerde fuer 5 Silber ein Auge zudrücken",
                ],
                attitude_to_party="neutral",
                relationships=[
                    {"npc_id": npc_grashnak_id, "type": "Untergebener", "description": "Hat Angst vor Grashnak"},
                ],
                location="Turm des Orkschamanen, Eingang",
                is_combatant=True,
                creature_template_id="orkraeuber",
                tags=["wache", "bestechlich", "ork", "optional"],
                gm_notes=(
                    "Diese Wache kann bestochen werden (5 Silber oder Alkohol) oder eingeschuechtert "
                    "(Einschuechtern gegen 14). Bei Bestechung laesst sie die Helden durch das Tor "
                    "und 'schlaeft ein'. Bei Einschuechterung flieht sie. Kaempft nur, wenn sie in "
                    "die Enge getrieben wird. LeP 18, AT 11, PA 7. Kann als komischer Moment gespielt "
                    "werden, um Spannung zu loesen."
                ),
                known_to_players=False,
                player_visible_info=(
                    "Ein Ork mit einer zu grossen Rüstung, der sich gegen seine Hellebarde lehnt "
                    "und döst. Er scheint nicht der aufmerksamste Wächter zu sein."
                ),
            ),
            NPC(
                id=npc_alenia_id,
                campaign_id=campaign_id,
                adventure_id=adventure_id,
                name="Perainepriesterin Alenia",
                icon_id="priestess",
                personality_tags=["gutig", "weise", "ruhig", "entschlossen"],
                voice_notes=(
                    "Spricht sanft und melodisch, mit einer beruhigenden Stimme, die an plätscherndes "
                    "Wasser erinnert. Betet leise, wenn sie heilt. Wird ernst und eindringlich, wenn "
                    "sie von der Bedrohung durch den Schamanen spricht."
                ),
                knows=[
                    "Der Wegschrein war einst ein maechtigerer Tempel, der den Wald beschuetzte",
                    "Der Orkschamane hat die Schutzmagie des Schreins teilweise gebrochen",
                    "Das Schwert des Koenigs wurde mit einem Peraineritual geweiht",
                    "Es gibt alte Prophezeiungen ueber einen Schamanen, der den Wald verdirbt",
                    "Kraeuterkunde: Athelas waechst am Schrein und kann Wunden heilen",
                ],
                secrets=[
                    "Alenia hat Visionen vom Untergang des Waldes, wenn der Schamane nicht aufgehalten wird",
                    "Sie traegt einen geweihten Dolch, der gegen Daemonen wirkt (+2 TP gegen Daemonen)",
                    "Sie ist eine Auserwaehlte Peraines und hat dadurch besondere Heilkräfte",
                ],
                attitude_to_party="wohlwollend",
                relationships=[],
                location="Wegschrein der Peraine",
                is_combatant=False,
                tags=["heilerin", "questgeber", "peraine", "wald"],
                gm_notes=(
                    "Alenia kann die Gruppe heilen: Balsam (bis zu 2W6+3 LeP) und Zustaende kurieren. "
                    "Sie gibt den Helden ihren geweihten Dolch fuer den Kampf gegen den Schamanen (+2 TP "
                    "gegen daemonisch beeinflusste Wesen). Wenn die Helden den Schrein reinigen "
                    "(Goetter und Kulte Probe gegen 12), gibt sie ihnen zusaetzlich 3 Heiltranke. "
                    "Sie warnt vor dem Alarm-Kristall in Grashnaks Kammer."
                ),
                known_to_players=False,
                player_visible_info=(
                    "Eine junge Frau in einer grünen Robe mit dem Symbol der Peraine — einer goldenen "
                    "Aehre. Ihr Gesicht strahlt eine uebernatuerliche Ruhe aus, und wo sie geht, "
                    "scheinen die Pflanzen etwas kraeftiger zu wachsen."
                ),
            ),
        ]

        for npc in npcs_data:
            session.add(npc)
            counts["npcs"] += 1

        # ==================================================================
        # 4. CREATE MAPS (need IDs before scenes reference them)
        # ==================================================================

        # --- Map 1: Taverne Erdgeschoss (12x10) ---
        map_taverne_id = _id()
        map_taverne = GameMap(
            id=map_taverne_id,
            name="Taverne zum Goldenen Keiler - Erdgeschoss",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 12, "height": 10, "cell_px": 64},
            walls=[
                # Outer walls — with door gap at front entrance (5,0)-(7,0)
                {"from": [0, 0], "to": [5, 0]},
                {"from": [7, 0], "to": [12, 0]},
                {"from": [12, 0], "to": [12, 10]},
                {"from": [12, 10], "to": [0, 10]},
                {"from": [0, 10], "to": [0, 0]},
                # Bar counter (L-shaped)
                {"from": [8, 2], "to": [8, 5]},
                {"from": [8, 5], "to": [11, 5]},
                # Kitchen wall — door gap at (8,1)-(8,2) for kitchen access
                {"from": [8, 0], "to": [8, 1]},
                # Private room wall — door gap at (3,6)-(4,6)
                {"from": [0, 6], "to": [3, 6]},
                {"from": [4, 6], "to": [5, 6]},
                # Storage room wall — door gap at (10,7)-(11,7)
                {"from": [8, 7], "to": [10, 7]},
                {"from": [11, 7], "to": [12, 7]},
                {"from": [8, 7], "to": [8, 10]},
            ],
            difficult_terrain=[],
            initial_fog=False,
            landmarks=[
                {"x": 9, "y": 1, "name": "Kueche", "icon": "cooking_pot"},
                {"x": 10, "y": 3, "name": "Theke", "icon": "bar"},
                {"x": 3, "y": 2, "name": "Kamin", "icon": "fireplace"},
                {"x": 2, "y": 4, "name": "Gastraum", "icon": "tables"},
                {"x": 5, "y": 4, "name": "Tisch mit Kerze", "icon": "candle"},
                {"x": 2, "y": 8, "name": "Privatzimmer", "icon": "bed"},
                {"x": 10, "y": 9, "name": "Lagerraum", "icon": "barrel"},
                {"x": 6, "y": 0, "name": "Eingang", "icon": "door"},
                {"x": 3.5, "y": 6, "name": "Tuer Privatzimmer", "icon": "door"},
                {"x": 8, "y": 1.5, "name": "Kuechentuer", "icon": "door"},
                {"x": 10.5, "y": 7, "name": "Lagertuer", "icon": "door"},
            ],
        )
        session.add(map_taverne)
        counts["maps"] += 1

        # Tavern tokens
        tavern_tokens = [
            MapToken(id=_id(), map_id=map_taverne_id, entity_type="npc", entity_id=npc_gregor_id,
                     name="Gregor der Wirt", icon_id="innkeeper", position_x=10, position_y=4,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_taverne_id, entity_type="landmark", entity_id=None,
                     name="Tisch 1", icon_id="table", position_x=2, position_y=3,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_taverne_id, entity_type="landmark", entity_id=None,
                     name="Tisch 2", icon_id="table", position_x=5, position_y=3,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_taverne_id, entity_type="landmark", entity_id=None,
                     name="Tisch 3", icon_id="table", position_x=2, position_y=5,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_taverne_id, entity_type="landmark", entity_id=None,
                     name="Tisch 4", icon_id="table", position_x=5, position_y=5,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_taverne_id, entity_type="landmark", entity_id=None,
                     name="Kamin", icon_id="fireplace", position_x=3, position_y=1,
                     token_size=1, visible_to_players=True),
        ]
        for t in tavern_tokens:
            session.add(t)
            counts["tokens"] += 1

        # Tavern fog: fully revealed
        fog_taverne = FogState(
            id=_id(),
            map_id=map_taverne_id,
            revealed_cells=[[x, y] for x in range(12) for y in range(10)],
        )
        session.add(fog_taverne)
        counts["fog_states"] += 1

        # Tavern triggers
        trigger_secret_door = MapTrigger(
            id=_id(),
            map_id=map_taverne_id,
            position_x=9,
            position_y=5,
            trigger_type="discovery",
            name="Geheimtuer hinter der Theke",
            gm_description=(
                "Hinter der Theke verbirgt sich eine schmale Tuer, die in den Keller fuehrt. "
                "Dort lagert Rondrik einen Teil seiner Beute. Die Tuer ist durch ein Regal verdeckt."
            ),
            auto_probe={"talent": "Sinnesschaerfe", "difficulty": 14},
            on_trigger={"type": "reveal", "description": "Ein Regal an der Wand steht leicht schief. Dahinter ist eine schmale Tuer sichtbar."},
            on_success="Ihr bemerkt, dass das Regal hinter der Theke nicht richtig an der Wand steht. Dahinter verbirgt sich eine schmale Tuer, die in einen dunklen Keller fuehrt.",
            on_failure="Die Theke sieht ganz normal aus. Nichts Auffaelliges.",
            visible_to_gm=True,
            revealed=False,
            one_shot=True,
            trigger_on="approach",
        )
        session.add(trigger_secret_door)
        counts["triggers"] += 1

        # --- Map 2: Waldstrasse / Nordpfad (16x10) ---
        map_nordpfad_id = _id()
        map_nordpfad = GameMap(
            id=map_nordpfad_id,
            name="Waldstrasse am Nordpfad",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 16, "height": 10, "cell_px": 64},
            walls=[
                # Dense tree lines on both sides of the road
                {"from": [0, 0], "to": [16, 0]},
                {"from": [0, 3], "to": [3, 3]},
                {"from": [5, 3], "to": [11, 3]},
                {"from": [13, 3], "to": [16, 3]},
                {"from": [0, 7], "to": [3, 7]},
                {"from": [5, 7], "to": [11, 7]},
                {"from": [13, 7], "to": [16, 7]},
                {"from": [0, 10], "to": [16, 10]},
                # Fallen tree blocking partial path
                {"from": [7, 4], "to": [9, 5]},
            ],
            difficult_terrain=[
                [1, 4], [1, 5], [1, 6],
                [2, 4], [2, 6],
                [14, 4], [14, 5], [14, 6],
                [15, 4], [15, 6],
                [7, 5], [8, 5], [9, 5],
            ],
            initial_fog=True,
            landmarks=[
                {"x": 0, "y": 5, "name": "Weg nach Sueden", "icon": "path"},
                {"x": 15, "y": 5, "name": "Weg nach Norden", "icon": "path"},
                {"x": 8, "y": 4, "name": "Umgestuerzter Baum", "icon": "fallen_tree"},
                {"x": 3, "y": 1, "name": "Dichtes Gebuesch", "icon": "bush"},
                {"x": 13, "y": 1, "name": "Dichtes Gebuesch", "icon": "bush"},
            ],
        )
        session.add(map_nordpfad)
        counts["maps"] += 1

        # Nordpfad tokens: hidden bandits
        nordpfad_tokens = [
            MapToken(id=_id(), map_id=map_nordpfad_id, entity_type="creature", entity_id=None,
                     name="Bandit 1", icon_id="bandit", position_x=2, position_y=2,
                     token_size=1, visible_to_players=False, current_lep=22, max_lep=22),
            MapToken(id=_id(), map_id=map_nordpfad_id, entity_type="creature", entity_id=None,
                     name="Bandit 2", icon_id="bandit", position_x=13, position_y=2,
                     token_size=1, visible_to_players=False, current_lep=22, max_lep=22),
            MapToken(id=_id(), map_id=map_nordpfad_id, entity_type="creature", entity_id=None,
                     name="Bandit 3", icon_id="bandit", position_x=14, position_y=8,
                     token_size=1, visible_to_players=False, current_lep=22, max_lep=22),
            MapToken(id=_id(), map_id=map_nordpfad_id, entity_type="npc", entity_id=npc_rondrik_id,
                     name="Rondrik der Bandit", icon_id="bandit_leader", position_x=8, position_y=2,
                     token_size=1, visible_to_players=False, current_lep=32, max_lep=32),
        ]
        for t in nordpfad_tokens:
            session.add(t)
            counts["tokens"] += 1

        # Nordpfad fog: all hidden
        fog_nordpfad = FogState(
            id=_id(),
            map_id=map_nordpfad_id,
            revealed_cells=[],
        )
        session.add(fog_nordpfad)
        counts["fog_states"] += 1

        # --- Map 2b: Dunkelwald - Wildpfad (18x12) ---
        map_dunkelwald_id = _id()
        map_dunkelwald = GameMap(
            id=map_dunkelwald_id,
            name="Dunkelwald - Wildpfad",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 18, "height": 12, "cell_px": 64},
            walls=[
                # Dense forest borders — top and bottom tree lines
                {"from": [0, 0], "to": [18, 0]},
                {"from": [0, 12], "to": [18, 12]},
                # Left forest wall with narrow entrance
                {"from": [0, 0], "to": [0, 5]},
                {"from": [0, 7], "to": [0, 12]},
                # Right forest wall with narrow exit
                {"from": [18, 0], "to": [18, 4]},
                {"from": [18, 8], "to": [18, 12]},
                # Inner tree clusters — path winds between them
                {"from": [4, 0], "to": [4, 3]},
                {"from": [5, 9], "to": [5, 12]},
                {"from": [8, 0], "to": [8, 2]},
                {"from": [9, 10], "to": [9, 12]},
                {"from": [12, 0], "to": [12, 3]},
                {"from": [13, 9], "to": [13, 12]},
                # Fallen log across path
                {"from": [9, 5], "to": [11, 6]},
            ],
            difficult_terrain=[
                # Roots and undergrowth along the path
                [2, 5], [2, 6], [3, 7],
                [6, 3], [6, 4], [7, 8], [7, 9],
                [10, 5], [10, 6], [11, 6],
                [14, 4], [14, 5], [15, 7], [15, 8],
                # Dense brush around abandoned camp
                [3, 9], [3, 10], [4, 9], [4, 10],
                # Thorns near stone tablet
                [15, 1], [15, 2], [16, 1], [16, 2],
            ],
            initial_fog=True,
            landmarks=[
                {"x": 0, "y": 6, "name": "Pfad vom Nordpfad", "icon": "path"},
                {"x": 17, "y": 6, "name": "Pfad zum Wegschrein", "icon": "path"},
                {"x": 10, "y": 5, "name": "Umgestuerzter Baumstamm", "icon": "fallen_tree"},
                {"x": 4, "y": 9, "name": "Verlassenes Lager", "icon": "campfire_dead"},
                {"x": 16, "y": 2, "name": "Alte Steintafel", "icon": "stone_tablet"},
                {"x": 9, "y": 1, "name": "Dichter Farn", "icon": "bush"},
                {"x": 6, "y": 7, "name": "Modriger Totholzhaufen", "icon": "deadwood"},
                {"x": 14, "y": 10, "name": "Dornendickicht", "icon": "thorns"},
            ],
        )
        session.add(map_dunkelwald)
        counts["maps"] += 1

        # Dunkelwald tokens
        dunkelwald_tokens = [
            # Wolves — hidden, scattered along the path
            MapToken(id=_id(), map_id=map_dunkelwald_id, entity_type="creature", entity_id=None,
                     name="Wolf 1", icon_id="wolf", position_x=7, position_y=4,
                     token_size=1, visible_to_players=False, current_lep=15, max_lep=15),
            MapToken(id=_id(), map_id=map_dunkelwald_id, entity_type="creature", entity_id=None,
                     name="Wolf 2", icon_id="wolf", position_x=11, position_y=8,
                     token_size=1, visible_to_players=False, current_lep=15, max_lep=15),
            MapToken(id=_id(), map_id=map_dunkelwald_id, entity_type="creature", entity_id=None,
                     name="Wolf 3", icon_id="wolf", position_x=13, position_y=3,
                     token_size=1, visible_to_players=False, current_lep=15, max_lep=15),
            # Koehler guide — visible if present
            MapToken(id=_id(), map_id=map_dunkelwald_id, entity_type="npc", entity_id=npc_koehler_id,
                     name="Alrik der Koehler", icon_id="woodsman", position_x=1, position_y=6,
                     token_size=1, visible_to_players=True),
            # Abandoned camp — discoverable landmark
            MapToken(id=_id(), map_id=map_dunkelwald_id, entity_type="landmark", entity_id=None,
                     name="Verlassenes Lager", icon_id="campfire_dead", position_x=4, position_y=10,
                     token_size=1, visible_to_players=False),
            # Stone tablet — discoverable
            MapToken(id=_id(), map_id=map_dunkelwald_id, entity_type="landmark", entity_id=None,
                     name="Steintafel mit Runen", icon_id="stone_tablet", position_x=16, position_y=2,
                     token_size=1, visible_to_players=False),
            # Glowing eyes in the darkness — atmosphere token
            MapToken(id=_id(), map_id=map_dunkelwald_id, entity_type="landmark", entity_id=None,
                     name="Leuchtende Augen", icon_id="eyes_glow", position_x=3, position_y=2,
                     token_size=1, visible_to_players=False),
        ]
        for t in dunkelwald_tokens:
            session.add(t)
            counts["tokens"] += 1

        # Dunkelwald triggers
        dunkelwald_triggers = [
            # Wolf ambush zone — Sinnesschaerfe to detect before they attack
            MapTrigger(
                id=_id(),
                map_id=map_dunkelwald_id,
                position_x=8, position_y=5,
                trigger_type="encounter",
                name="Wolfshinterhalt",
                gm_description="3 Woelfe greifen an wenn die Gruppe hier vorbeikommt (Zufallsbegegnung 11-15).",
                auto_probe={"skill": "Sinnesschaerfe", "target": 10, "attribute_mods": [0, 0, 0]},
                on_success="Helden bemerken die Woelfe rechtzeitig und koennen sich vorbereiten.",
                on_failure="Die Woelfe greifen ueberraschend aus dem Unterholz an!",
                visible_to_gm=True,
                revealed=False,
                one_shot=True,
            ),
            # Abandoned camp discovery
            MapTrigger(
                id=_id(),
                map_id=map_dunkelwald_id,
                position_x=4, position_y=10,
                trigger_type="discovery",
                name="Verlassenes Banditenlager",
                gm_description="Ein aufgegebenes Lager. Feuerstelle erkaltet, aber Spuren von Banditen. 3 Silbertaler und Hinweise auf die Bande.",
                auto_probe={"skill": "Faehrtensuchen", "target": 8, "attribute_mods": [0, 0, 0]},
                on_success="Die Helden finden 3 Silbertaler und Spuren, die zum Nordpfad fuehren — Banditen waren hier.",
                on_failure="Ein verlassenes Lager, aber keine verwertbaren Hinweise.",
                visible_to_gm=True,
                revealed=False,
                one_shot=True,
            ),
            # Stone tablet discovery
            MapTrigger(
                id=_id(),
                map_id=map_dunkelwald_id,
                position_x=16, position_y=2,
                trigger_type="discovery",
                name="Zwergische Steintafel",
                gm_description="Eine moosbewachsene Steintafel mit uralten zwergischen Runen. Sagen und Legenden gegen 12 enthuellt Informationen ueber eine verlassene Zwergenmine.",
                auto_probe={"skill": "Sagen und Legenden", "target": 12, "attribute_mods": [0, 0, 0]},
                on_success="Die Runen berichten von der Zwergenmine 'Granitfaust', die vor Jahrhunderten aufgegeben wurde. Der Turm wurde auf ihren Ruinen errichtet.",
                on_failure="Uralte, verwitterte Runen — unlesbar fuer euch.",
                visible_to_gm=True,
                revealed=False,
                one_shot=True,
            ),
        ]
        for t in dunkelwald_triggers:
            session.add(t)
            counts["triggers"] += 1

        # Dunkelwald fog: all hidden (explored incrementally)
        fog_dunkelwald = FogState(
            id=_id(),
            map_id=map_dunkelwald_id,
            revealed_cells=[],
        )
        session.add(fog_dunkelwald)
        counts["fog_states"] += 1

        # --- Map 3: Dunkelwald Lichtung (14x12) ---
        map_lichtung_id = _id()
        map_lichtung = GameMap(
            id=map_lichtung_id,
            name="Dunkelwald - Lichtung am Wegschrein",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 14, "height": 12, "cell_px": 64},
            walls=[
                # Dense tree border
                {"from": [0, 0], "to": [14, 0]},
                {"from": [14, 0], "to": [14, 12]},
                {"from": [14, 12], "to": [0, 12]},
                {"from": [0, 12], "to": [0, 0]},
                # Tree clusters inside
                {"from": [0, 0], "to": [3, 3]},
                {"from": [11, 0], "to": [14, 3]},
                {"from": [0, 9], "to": [3, 12]},
                {"from": [11, 9], "to": [14, 12]},
                # Narrow path entrance from south
                {"from": [5, 12], "to": [5, 10]},
                {"from": [9, 12], "to": [9, 10]},
            ],
            difficult_terrain=[
                [3, 3], [3, 4], [4, 3],
                [10, 3], [10, 4], [11, 3],
                [3, 8], [3, 9], [4, 9],
                [10, 8], [10, 9], [11, 9],
            ],
            initial_fog=True,
            landmarks=[
                {"x": 7, "y": 5, "name": "Wegschrein der Peraine", "icon": "shrine"},
                {"x": 7, "y": 6, "name": "Altar mit Blumen", "icon": "altar"},
                {"x": 5, "y": 7, "name": "Moosbett", "icon": "moss"},
                {"x": 9, "y": 7, "name": "Alte Steinbank", "icon": "bench"},
                {"x": 7, "y": 11, "name": "Pfad nach Sueden", "icon": "path"},
                {"x": 7, "y": 0, "name": "Pfad zum Turm", "icon": "path"},
            ],
        )
        session.add(map_lichtung)
        counts["maps"] += 1

        # Lichtung tokens
        lichtung_tokens = [
            MapToken(id=_id(), map_id=map_lichtung_id, entity_type="npc", entity_id=npc_alenia_id,
                     name="Perainepriesterin Alenia", icon_id="priestess", position_x=7, position_y=5,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_lichtung_id, entity_type="landmark", entity_id=None,
                     name="Wegschrein der Peraine", icon_id="shrine", position_x=7, position_y=6,
                     token_size=2, visible_to_players=True),
        ]
        for t in lichtung_tokens:
            session.add(t)
            counts["tokens"] += 1

        fog_lichtung = FogState(
            id=_id(),
            map_id=map_lichtung_id,
            revealed_cells=[],
        )
        session.add(fog_lichtung)
        counts["fog_states"] += 1

        # --- Map 4: Turmvorplatz (12x12) ---
        map_vorplatz_id = _id()
        map_vorplatz = GameMap(
            id=map_vorplatz_id,
            name="Turmvorplatz",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 12, "height": 12, "cell_px": 64},
            walls=[
                # Forest edge
                {"from": [0, 0], "to": [12, 0]},
                {"from": [0, 0], "to": [0, 12]},
                {"from": [12, 0], "to": [12, 12]},
                # Tower outer wall (square structure in center-right) — gate gap at (6,5)-(6,6)
                {"from": [6, 2], "to": [11, 2]},
                {"from": [11, 2], "to": [11, 9]},
                {"from": [11, 9], "to": [6, 9]},
                {"from": [6, 9], "to": [6, 6]},   # South of gate
                {"from": [6, 5], "to": [6, 2]},   # North of gate
            ],
            difficult_terrain=[
                [1, 1], [2, 1], [1, 2],
                [0, 10], [1, 10], [0, 11], [1, 11],
                [11, 10], [11, 11],
            ],
            initial_fog=True,
            landmarks=[
                {"x": 6, "y": 5, "name": "Turmtor", "icon": "gate"},
                {"x": 4, "y": 7, "name": "Lagerfeuer", "icon": "campfire"},
                {"x": 3, "y": 3, "name": "Gebuesch", "icon": "bush"},
                {"x": 8, "y": 0, "name": "Turmmauer", "icon": "wall"},
                {"x": 0, "y": 6, "name": "Waldrand", "icon": "forest_edge"},
            ],
        )
        session.add(map_vorplatz)
        counts["maps"] += 1

        # Vorplatz tokens: patrolling Orks
        vorplatz_tokens = [
            MapToken(id=_id(), map_id=map_vorplatz_id, entity_type="creature", entity_id=None,
                     name="Orkraeuber Patrouille 1", icon_id="orc", position_x=4, position_y=6,
                     token_size=1, visible_to_players=False, current_lep=20, max_lep=20),
            MapToken(id=_id(), map_id=map_vorplatz_id, entity_type="creature", entity_id=None,
                     name="Orkraeuber Patrouille 2", icon_id="orc", position_x=5, position_y=8,
                     token_size=1, visible_to_players=False, current_lep=20, max_lep=20),
            MapToken(id=_id(), map_id=map_vorplatz_id, entity_type="npc", entity_id=npc_wache_id,
                     name="Wache am Tor", icon_id="orc_guard", position_x=6, position_y=5,
                     token_size=1, visible_to_players=False, current_lep=18, max_lep=18),
            MapToken(id=_id(), map_id=map_vorplatz_id, entity_type="landmark", entity_id=None,
                     name="Lagerfeuer", icon_id="campfire", position_x=4, position_y=7,
                     token_size=1, visible_to_players=True),
        ]
        for t in vorplatz_tokens:
            session.add(t)
            counts["tokens"] += 1

        fog_vorplatz = FogState(
            id=_id(),
            map_id=map_vorplatz_id,
            revealed_cells=[],
        )
        session.add(fog_vorplatz)
        counts["fog_states"] += 1

        # --- Map 5: Turm Erdgeschoss (10x10) ---
        map_turm_eg_id = _id()
        map_turm_eg = GameMap(
            id=map_turm_eg_id,
            name="Turm des Orkschamanen - Erdgeschoss",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 10, "height": 10, "cell_px": 64},
            walls=[
                # Outer walls — main gate gap at (0,1)-(0,3)
                {"from": [0, 0], "to": [10, 0]},
                {"from": [10, 0], "to": [10, 10]},
                {"from": [10, 10], "to": [0, 10]},
                {"from": [0, 10], "to": [0, 3]},
                {"from": [0, 1], "to": [0, 0]},
                # Entrance hall to guard room wall — door gap at (4,2)-(4,3)
                {"from": [4, 0], "to": [4, 2]},
                {"from": [4, 3], "to": [4, 4]},
                # Hallway north wall — door gap at (2,4)-(3,4) from entrance hall to corridor
                {"from": [0, 4], "to": [2, 4]},
                {"from": [3, 4], "to": [4, 4]},
                # Guard room south wall — door gap at (5,4)-(6,4) to corridor
                {"from": [4, 4], "to": [5, 4]},
                {"from": [6, 4], "to": [7, 4]},
                # Torture chamber walls — door gap at (2,6)-(3,6)
                {"from": [0, 6], "to": [2, 6]},
                {"from": [3, 6], "to": [5, 6]},
                {"from": [5, 4], "to": [5, 8]},
                # Treasure room walls — door gap at (7,6)-(7,7) (locked!)
                {"from": [5, 8], "to": [10, 8]},
                {"from": [7, 4], "to": [7, 6]},
                {"from": [7, 7], "to": [7, 8]},
                # Staircase area — door gap at (8,4)-(9,4)
                {"from": [7, 4], "to": [8, 4]},
                {"from": [9, 4], "to": [10, 4]},
            ],
            difficult_terrain=[
                [8, 1], [9, 1], [8, 2], [9, 2],  # Rubble near stairs
            ],
            initial_fog=True,
            landmarks=[
                {"x": 2, "y": 2, "name": "Eingangshalle", "icon": "entrance"},
                {"x": 6, "y": 2, "name": "Wachraum", "icon": "guard_room"},
                {"x": 2, "y": 5, "name": "Korridor", "icon": "hallway"},
                {"x": 2, "y": 8, "name": "Folterkammer", "icon": "torture"},
                {"x": 8, "y": 6, "name": "Schatzkammer", "icon": "treasure"},
                {"x": 9, "y": 2, "name": "Treppe nach oben", "icon": "stairs_up"},
                {"x": 0, "y": 2, "name": "Eingangstor", "icon": "door"},
                {"x": 4, "y": 2.5, "name": "Tuer Wachraum", "icon": "door"},
                {"x": 2.5, "y": 4, "name": "Tuer Korridor", "icon": "door"},
                {"x": 5.5, "y": 4, "name": "Tuer zum Gang", "icon": "door"},
                {"x": 2.5, "y": 6, "name": "Tuer Folterkammer", "icon": "door"},
                {"x": 7, "y": 6.5, "name": "Eisentuer Schatzkammer (verschlossen)", "icon": "door_locked"},
                {"x": 8.5, "y": 4, "name": "Tuer Treppenhaus", "icon": "door"},
            ],
        )
        session.add(map_turm_eg)
        counts["maps"] += 1

        # Tower ground floor tokens
        turm_eg_tokens = [
            MapToken(id=_id(), map_id=map_turm_eg_id, entity_type="creature", entity_id=None,
                     name="Orkraeuber 1", icon_id="orc", position_x=5, position_y=2,
                     token_size=1, visible_to_players=False, current_lep=20, max_lep=20),
            MapToken(id=_id(), map_id=map_turm_eg_id, entity_type="creature", entity_id=None,
                     name="Orkraeuber 2", icon_id="orc", position_x=6, position_y=3,
                     token_size=1, visible_to_players=False, current_lep=20, max_lep=20),
            MapToken(id=_id(), map_id=map_turm_eg_id, entity_type="creature", entity_id=None,
                     name="Orkraeuber 3", icon_id="orc", position_x=5, position_y=1,
                     token_size=1, visible_to_players=False, current_lep=20, max_lep=20),
            MapToken(id=_id(), map_id=map_turm_eg_id, entity_type="creature", entity_id=None,
                     name="Orkkrieger", icon_id="orc_warrior", position_x=6, position_y=1,
                     token_size=1, visible_to_players=False, current_lep=30, max_lep=30),
            MapToken(id=_id(), map_id=map_turm_eg_id, entity_type="npc", entity_id=npc_praxus_id,
                     name="Haendler Praxus (gefangen)", icon_id="prisoner", position_x=2, position_y=8,
                     token_size=1, visible_to_players=False, current_lep=8, max_lep=26),
        ]
        for t in turm_eg_tokens:
            session.add(t)
            counts["tokens"] += 1

        # Tower ground floor triggers
        trigger_pit_trap = MapTrigger(
            id=_id(),
            map_id=map_turm_eg_id,
            position_x=2,
            position_y=4,
            trigger_type="trap",
            name="Fallgrube im Korridor",
            gm_description=(
                "Eine getarnte Fallgrube im Korridor. Der Boden gibt nach und der "
                "Held faellt 2 Schritt tief auf spitze Pfaehle."
            ),
            auto_probe={"talent": "Sinnesschaerfe", "difficulty": 12},
            on_trigger={"type": "damage", "formula": "1W6+2", "damage_type": "Sturz"},
            on_success=(
                "Ihr bemerkt, dass der Steinboden an dieser Stelle leicht federt. "
                "Bei genauerem Hinsehen erkennt ihr eine geschickt getarnte Fallgrube!"
            ),
            on_failure=(
                "Der Boden bricht ein! Ihr stuerzt zwei Schritt tief in eine Grube "
                "mit angespitzten Pfaehlen und erleidet 1W6+2 Trefferpunkte Schaden."
            ),
            visible_to_gm=True,
            revealed=False,
            one_shot=True,
            trigger_on="step",
        )
        session.add(trigger_pit_trap)
        counts["triggers"] += 1

        trigger_poison_dart = MapTrigger(
            id=_id(),
            map_id=map_turm_eg_id,
            position_x=8,
            position_y=7,
            trigger_type="trap",
            name="Giftpfeilfalle in der Schatzkammer",
            gm_description=(
                "Die Tuer zur Schatzkammer ist mit einer Giftpfeilfalle gesichert. "
                "Beim Oeffnen der Tuer werden kleine Pfeile aus der Wand geschossen."
            ),
            auto_probe={"talent": "Sinnesschaerfe", "difficulty": 14},
            on_trigger={"type": "poison", "level": 3, "effect": "Betaeubungsgift Stufe 3", "damage": "1W3"},
            on_success=(
                "Ihr bemerkt winzige Loecher in der Wand neben der Tuer. "
                "Dort stecken vergiftete Nadeln, die beim Oeffnen ausgeloest wuerden. "
                "Mit einem geschickten Griff koennt ihr den Mechanismus entschaerfen."
            ),
            on_failure=(
                "Als ihr die Tuer oeffnet, schiessen kleine vergiftete Pfeile aus der Wand! "
                "Ihr werdet getroffen und spuert sofort ein Brennen — Betaeubungsgift Stufe 3! "
                "Erleidet 1W3 Schadenspunkte und legt eine Zaehigkeitsprobe gegen das Gift ab."
            ),
            visible_to_gm=True,
            revealed=False,
            one_shot=True,
            trigger_on="interact",
        )
        session.add(trigger_poison_dart)
        counts["triggers"] += 1

        fog_turm_eg = FogState(
            id=_id(),
            map_id=map_turm_eg_id,
            revealed_cells=[],
        )
        session.add(fog_turm_eg)
        counts["fog_states"] += 1

        # --- Map 5b: Taverne Privatzimmer — close-up for Koehler scene (8x8) ---
        map_privatzimmer_id = _id()
        map_privatzimmer = GameMap(
            id=map_privatzimmer_id,
            name="Taverne - Privatzimmer und Gastraum",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 8, "height": 8, "cell_px": 64},
            walls=[
                # Outer walls — front door gap at (3,0)-(5,0)
                {"from": [0, 0], "to": [3, 0]},
                {"from": [5, 0], "to": [8, 0]},
                {"from": [8, 0], "to": [8, 8]},
                {"from": [8, 8], "to": [0, 8]},
                {"from": [0, 8], "to": [0, 0]},
                # Dividing wall with doorway to private room at (3,4)-(4,4)
                {"from": [0, 4], "to": [3, 4]},
                {"from": [4, 4], "to": [8, 4]},
                # Bar counter at back
                {"from": [6, 0], "to": [6, 3]},
            ],
            difficult_terrain=[],
            initial_fog=False,
            landmarks=[
                {"x": 4, "y": 0, "name": "Eingang von der Strasse", "icon": "door"},
                {"x": 7, "y": 1, "name": "Theke", "icon": "bar"},
                {"x": 2, "y": 2, "name": "Kamin", "icon": "fireplace"},
                {"x": 4, "y": 2, "name": "Grosser Tisch", "icon": "table"},
                {"x": 3.5, "y": 4, "name": "Tuer zum Privatzimmer", "icon": "door"},
                {"x": 2, "y": 6, "name": "Privattisch", "icon": "table"},
                {"x": 6, "y": 6, "name": "Bett und Truhe", "icon": "bed"},
            ],
        )
        session.add(map_privatzimmer)
        counts["maps"] += 1

        privatzimmer_tokens = [
            MapToken(id=_id(), map_id=map_privatzimmer_id, entity_type="npc", entity_id=npc_gregor_id,
                     name="Gregor der Wirt", icon_id="innkeeper", position_x=7, position_y=2,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_privatzimmer_id, entity_type="npc", entity_id=npc_koehler_id,
                     name="Alrik der Koehler", icon_id="woodsman", position_x=4, position_y=1,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_privatzimmer_id, entity_type="landmark", entity_id=None,
                     name="Kamin", icon_id="fireplace", position_x=2, position_y=1,
                     token_size=1, visible_to_players=True),
            MapToken(id=_id(), map_id=map_privatzimmer_id, entity_type="landmark", entity_id=None,
                     name="Alriks Karte (auf dem Tisch)", icon_id="scroll", position_x=4, position_y=3,
                     token_size=1, visible_to_players=False),
        ]
        for t in privatzimmer_tokens:
            session.add(t)
            counts["tokens"] += 1

        fog_privatzimmer = FogState(
            id=_id(),
            map_id=map_privatzimmer_id,
            revealed_cells=[[x, y] for x in range(8) for y in range(8)],
        )
        session.add(fog_privatzimmer)
        counts["fog_states"] += 1

        # --- Map 5c: Folterkammer — zoomed torture chamber (8x6) ---
        map_folterkammer_id = _id()
        map_folterkammer = GameMap(
            id=map_folterkammer_id,
            name="Turm - Folterkammer",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 8, "height": 6, "cell_px": 64},
            walls=[
                # Outer walls — door gap at (0,2)-(0,4) west wall
                {"from": [0, 0], "to": [8, 0]},
                {"from": [8, 0], "to": [8, 6]},
                {"from": [8, 6], "to": [0, 6]},
                {"from": [0, 6], "to": [0, 4]},
                {"from": [0, 2], "to": [0, 0]},
                # Iron bars partition — gap at (5,1)-(5,2) for gate
                {"from": [5, 0], "to": [5, 1]},
                {"from": [5, 2], "to": [5, 3]},
            ],
            difficult_terrain=[
                # Blood and debris
                [2, 2], [3, 3], [1, 4],
            ],
            initial_fog=True,
            landmarks=[
                {"x": 0, "y": 3, "name": "Tuer zum Korridor", "icon": "door"},
                {"x": 5, "y": 1.5, "name": "Eisengitter (verschlossen)", "icon": "door_locked"},
                {"x": 1, "y": 1, "name": "Folterwerkzeuge", "icon": "torture_tools"},
                {"x": 3, "y": 1, "name": "Haengende Ketten", "icon": "chains"},
                {"x": 3, "y": 4, "name": "Strohmatratze", "icon": "straw"},
                {"x": 6, "y": 1, "name": "Eisenstange mit Ketten", "icon": "shackles"},
                {"x": 7, "y": 4, "name": "Eimer (Wasser)", "icon": "bucket"},
                {"x": 2, "y": 5, "name": "Blutflecken am Boden", "icon": "bloodstain"},
            ],
        )
        session.add(map_folterkammer)
        counts["maps"] += 1

        folterkammer_tokens = [
            MapToken(id=_id(), map_id=map_folterkammer_id, entity_type="npc", entity_id=npc_praxus_id,
                     name="Haendler Praxus (gefangen)", icon_id="prisoner", position_x=6, position_y=2,
                     token_size=1, visible_to_players=True, current_lep=8, max_lep=26,
                     conditions=["Schmerz II"]),
            MapToken(id=_id(), map_id=map_folterkammer_id, entity_type="landmark", entity_id=None,
                     name="Schluesselhaken (leer)", icon_id="key_hook", position_x=1, position_y=3,
                     token_size=1, visible_to_players=False),
        ]
        for t in folterkammer_tokens:
            session.add(t)
            counts["tokens"] += 1

        fog_folterkammer = FogState(
            id=_id(),
            map_id=map_folterkammer_id,
            revealed_cells=[],
        )
        session.add(fog_folterkammer)
        counts["fog_states"] += 1

        # --- Map 5d: Schatzkammer — trapped treasure vault (8x6) ---
        map_schatzkammer_id = _id()
        map_schatzkammer = GameMap(
            id=map_schatzkammer_id,
            name="Turm - Schatzkammer",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 8, "height": 6, "cell_px": 64},
            walls=[
                # Outer walls — locked iron door gap at (0,2)-(0,4) west wall
                {"from": [0, 0], "to": [8, 0]},
                {"from": [8, 0], "to": [8, 6]},
                {"from": [8, 6], "to": [0, 6]},
                {"from": [0, 6], "to": [0, 4]},
                {"from": [0, 2], "to": [0, 0]},
                # Alcove for weapons display
                {"from": [6, 0], "to": [6, 2]},
                {"from": [6, 2], "to": [8, 2]},
            ],
            difficult_terrain=[
                # Scattered coins and debris
                [3, 2], [3, 3], [4, 3], [4, 4],
            ],
            initial_fog=True,
            landmarks=[
                {"x": 0, "y": 3, "name": "Eisentuer (verschlossen)", "icon": "door_locked"},
                {"x": 2, "y": 1, "name": "Muenzkisten", "icon": "treasure_chest"},
                {"x": 4, "y": 1, "name": "Edelsteinkiste", "icon": "gem_chest"},
                {"x": 7, "y": 1, "name": "Waffenstaender", "icon": "weapon_rack"},
                {"x": 2, "y": 4, "name": "Koenigsteppich", "icon": "tapestry"},
                {"x": 6, "y": 4, "name": "Dokumentenstapel", "icon": "scrolls"},
                {"x": 5, "y": 5, "name": "Orkischer Ritualstab", "icon": "magic_staff"},
            ],
        )
        session.add(map_schatzkammer)
        counts["maps"] += 1

        schatzkammer_tokens = [
            MapToken(id=_id(), map_id=map_schatzkammer_id, entity_type="item", entity_id=None,
                     name="Qualitaetslangschwert", icon_id="quality_sword", position_x=7, position_y=1,
                     token_size=1, visible_to_players=False),
            MapToken(id=_id(), map_id=map_schatzkammer_id, entity_type="item", entity_id=None,
                     name="Kettenhemd", icon_id="chainmail", position_x=7, position_y=0,
                     token_size=1, visible_to_players=False),
            MapToken(id=_id(), map_id=map_schatzkammer_id, entity_type="item", entity_id=None,
                     name="Orkischer Ritualstab", icon_id="magic_staff", position_x=5, position_y=5,
                     token_size=1, visible_to_players=False),
            MapToken(id=_id(), map_id=map_schatzkammer_id, entity_type="landmark", entity_id=None,
                     name="Brief des 'Meisters'", icon_id="letter", position_x=6, position_y=4,
                     token_size=1, visible_to_players=False),
        ]
        for t in schatzkammer_tokens:
            session.add(t)
            counts["tokens"] += 1

        schatzkammer_trigger = MapTrigger(
            id=_id(),
            map_id=map_schatzkammer_id,
            position_x=0, position_y=3,
            trigger_type="trap",
            name="Giftpfeilfalle an der Tuer",
            gm_description=(
                "Die Tuer ist mit einer Giftpfeilfalle gesichert. Beim Oeffnen schiessen "
                "vergiftete Nadeln aus Wandloechern. Betaeubungsgift Stufe 3, 1W3 SP."
            ),
            auto_probe={"talent": "Sinnesschaerfe", "difficulty": 14},
            on_success="Ihr bemerkt winzige Loecher in der Wand. Mit Mechanik gegen 12 koennt ihr die Falle entschaerfen.",
            on_failure="Vergiftete Nadeln treffen euch! 1W3 SP und Betaeubungsgift Stufe 3!",
            visible_to_gm=True,
            revealed=False,
            one_shot=True,
            trigger_on="interact",
        )
        session.add(schatzkammer_trigger)
        counts["triggers"] += 1

        fog_schatzkammer = FogState(
            id=_id(),
            map_id=map_schatzkammer_id,
            revealed_cells=[],
        )
        session.add(fog_schatzkammer)
        counts["fog_states"] += 1

        # --- Map 6: Turmspitze - Kammer des Schamanen (8x8) ---
        map_turmspitze_id = _id()
        map_turmspitze = GameMap(
            id=map_turmspitze_id,
            name="Turmspitze - Kammer des Schamanen",
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            grid_config={"type": "square", "width": 8, "height": 8, "cell_px": 64},
            walls=[
                # Circular room approximated as octagon — door gap at stairs (SW corner)
                {"from": [2, 0], "to": [6, 0]},
                {"from": [6, 0], "to": [8, 2]},
                {"from": [8, 2], "to": [8, 6]},
                {"from": [8, 6], "to": [6, 8]},
                {"from": [6, 8], "to": [2, 8]},
                {"from": [2, 8], "to": [1, 7]},   # Gap at (1,7)-(0.5,6.5) for stair door
                {"from": [0.5, 6.5], "to": [0, 6]},
                {"from": [0, 6], "to": [0, 2]},
                {"from": [0, 2], "to": [2, 0]},
            ],
            difficult_terrain=[
                # Magic circle on floor
                [3, 3], [4, 3], [5, 3],
                [3, 4], [5, 4],
                [3, 5], [4, 5], [5, 5],
            ],
            initial_fog=True,
            landmarks=[
                {"x": 4, "y": 4, "name": "Altar mit dem Schwert", "icon": "altar"},
                {"x": 4, "y": 3, "name": "Magischer Kreis", "icon": "magic_circle"},
                {"x": 1, "y": 1, "name": "Runengeschmueckter Pfeiler", "icon": "pillar"},
                {"x": 7, "y": 1, "name": "Knochenstaender", "icon": "bones"},
                {"x": 1, "y": 7, "name": "Treppe nach unten", "icon": "stairs_down"},
                {"x": 0.75, "y": 6.75, "name": "Schwere Steintuer", "icon": "door"},
                {"x": 7, "y": 7, "name": "Ritualkreis (klein)", "icon": "ritual"},
            ],
        )
        session.add(map_turmspitze)
        counts["maps"] += 1

        # Turmspitze tokens
        turmspitze_tokens = [
            MapToken(id=_id(), map_id=map_turmspitze_id, entity_type="npc", entity_id=npc_grashnak_id,
                     name="Orkschamane Grashnak", icon_id="orc_shaman", position_x=4, position_y=2,
                     token_size=1, visible_to_players=False, current_lep=38, max_lep=38),
            MapToken(id=_id(), map_id=map_turmspitze_id, entity_type="npc", entity_id=npc_urruk_id,
                     name="Orkhauptling Urruk", icon_id="orc_chief", position_x=3, position_y=5,
                     token_size=1, visible_to_players=False, current_lep=42, max_lep=42),
            MapToken(id=_id(), map_id=map_turmspitze_id, entity_type="creature", entity_id=None,
                     name="Orkkrieger 1", icon_id="orc_warrior", position_x=5, position_y=5,
                     token_size=1, visible_to_players=False, current_lep=30, max_lep=30),
            MapToken(id=_id(), map_id=map_turmspitze_id, entity_type="creature", entity_id=None,
                     name="Orkkrieger 2", icon_id="orc_warrior", position_x=6, position_y=3,
                     token_size=1, visible_to_players=False, current_lep=30, max_lep=30),
            MapToken(id=_id(), map_id=map_turmspitze_id, entity_type="item", entity_id=None,
                     name="Schwert des Koenigs", icon_id="magic_sword", position_x=4, position_y=4,
                     token_size=1, visible_to_players=False),
        ]
        for t in turmspitze_tokens:
            session.add(t)
            counts["tokens"] += 1

        # Alarm crystal trigger
        trigger_alarm = MapTrigger(
            id=_id(),
            map_id=map_turmspitze_id,
            position_x=1,
            position_y=7,
            trigger_type="event",
            name="Alarm-Kristall",
            gm_description=(
                "Ein leuchtender Kristall neben der Treppe. Wenn die Helden die Kammer "
                "betreten, ohne ihn zu deaktivieren, sendet er ein Signal und Grashnak "
                "wird gewarnt (kein Ueberraschungsangriff moeglich)."
            ),
            auto_probe={"talent": "Sinnesschaerfe", "difficulty": 10},
            on_trigger={
                "type": "alarm",
                "effect": "Grashnak wird gewarnt und beginnt den Kampf mit einem vorbereiteten Zauber",
            },
            on_success=(
                "Ihr bemerkt einen schwach glimmenden Kristall neben der Treppe. Er pulsiert "
                "leicht und scheint ein Alarmsystem zu sein. Mit einer Magiekunde-Probe (gegen 10) "
                "oder roher Gewalt (Kraftakt gegen 8) koennt ihr ihn deaktivieren."
            ),
            on_failure=(
                "Der Kristall blitzt hell auf, als ihr die Kammer betretet! Ein schriller Ton "
                "hallt durch den Raum. Der Orkschamane dreht sich um und grinst euch an — "
                "er hat euch erwartet!"
            ),
            visible_to_gm=True,
            revealed=False,
            one_shot=True,
            trigger_on="enter_room",
        )
        session.add(trigger_alarm)
        counts["triggers"] += 1

        fog_turmspitze = FogState(
            id=_id(),
            map_id=map_turmspitze_id,
            revealed_cells=[],
        )
        session.add(fog_turmspitze)
        counts["fog_states"] += 1

        # ==================================================================
        # 5. CREATE CHAPTERS AND SCENES
        # ==================================================================

        # --- Chapter 1: Der Hilferuf ---
        chapter1_id = _id()
        chapter1 = Chapter(
            id=chapter1_id,
            adventure_id=adventure_id,
            title="Der Hilferuf",
            summary=(
                "Die Helden treffen in einer Taverne am Wegesrand ein, wo sie von einem "
                "veraengstigten Koehler von der Bedrohung durch Orks erfahren. Gleichzeitig "
                "lauert eine Banditengefahr auf dem Nordpfad."
            ),
            chapter_goal=(
                "Die Helden sollen Informationen ueber den Turm des Orkschamanen sammeln "
                "und sich entscheiden, wie sie vorgehen. Optional koennen sie die Banditenbande "
                "aufdecken."
            ),
            sort_order=1,
        )
        session.add(chapter1)
        counts["chapters"] += 1

        # Scene 1.1
        scene_1_1_id = _id()
        scene_1_1 = Scene(
            id=scene_1_1_id,
            chapter_id=chapter1_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Die Taverne zum Goldenen Keiler",
            read_aloud=(
                "Der Regen prasselt unerbittlich auf eure Umhaenge, als ihr endlich das schwache "
                "Licht einer Laterne durch die Baeume schimmern seht. Eine Taverne, halb verborgen "
                "unter einer maechtigen Eiche, bietet Schutz vor der stuermischen Nacht. Ueber der "
                "niedrigen Tuer haengt ein verwittertes Schild: 'Zum Goldenen Keiler'. Warmes Licht "
                "faellt durch die beschlagenen Fenster, und der Geruch von Braten und Bier draengt "
                "nach draussen. Drinnen ist es warm und eng — ein halbes Dutzend Tische stehen im "
                "Gastraum, an denen vereinzelte Reisende sitzen. Hinter der Theke poliert ein "
                "staeramiger Mann mit nervoeser Miene Kruege."
            ),
            gm_notes=(
                "SCHLUESSELSZENE: Hier beginnt das Abenteuer. Der Wirt Gregor ist nervoes, weil "
                "sein Bruder Rondrik in letzter Zeit immer aggressiver wird. Er empfiehlt den "
                "Helden den 'kuerzeren' Nordpfad — der aber direkt in Rondriks Hinterhalt fuehrt.\n\n"
                "TIMING: Der Koehler Alrik trifft etwa eine Stunde nach den Helden ein (oder "
                "frueher, wenn die Szene zu lange dauert). Er bringt die Nachricht ueber die Orks.\n\n"
                "INTERAKTIONSMOEGLICHKEITEN:\n"
                "- Gregor befragen (Menschenkenntnis gegen 12 zeigt, dass er etwas verbirgt)\n"
                "- Mit anderen Gaesten reden (Geruechte ueber verschwundene Reisende)\n"
                "- Die Taverne untersuchen (Geheimtuer hinter der Theke)\n"
                "- Essen und Trinken (1 Silber pro Mahlzeit, 5 Heller pro Bier)"
            ),
            gm_secrets=[
                "Gregor schickt Reisende zum Nordpfad, wo Rondriks Bande sie ueberfaellt",
                "Der Koehler hat eine Karte zum Turm, die er nur widerwillig herausgibt",
                "Hinter der Theke gibt es eine Geheimtuer zum Keller (Sinnesschaerfe gegen 14)",
                "Im Keller lagern gestohlene Waren im Wert von 80 Silbertalern",
            ],
            npcs=[npc_gregor_id, npc_koehler_id],
            map_id=map_taverne_id,
            content_list=[
                {"id": "c_gregor", "cat": "npc", "name": "Gregor der Wirt", "desc": "Nervoeser Wirt, poliert hektisch Kruege. Verbirgt ein Geheimnis.", "player_desc": "Der Wirt — ein staeramiger Mann mit nervoeser Miene.", "visible": True, "probe": {"skill": "Menschenkenntnis", "target": 12, "success": "Er verbirgt etwas. Sein Blick flackert zum Nordpfad."}},
                {"id": "c_gaeste", "cat": "npc", "name": "Reisende Gaeste", "desc": "3-4 Gaeste im Gastraum. Erzaehlen Geruechte ueber verschwundene Reisende am Nordpfad.", "player_desc": "Vereinzelte Reisende an den Tischen.", "visible": True},
                {"id": "c_theke", "cat": "object", "name": "Theke mit Bierfaessern", "desc": "Hinter der Theke: Geheimtuer zum Keller.", "player_desc": "Eine massive Eichentheke mit Zapfhahn.", "visible": True},
                {"id": "c_kamin", "cat": "object", "name": "Kamin", "desc": "Warmes Feuer. Guter Platz fuer Gespraeche.", "player_desc": "Ein prasselnder Kamin spendet Waerme.", "visible": True},
                {"id": "c_tische", "cat": "object", "name": "Gastraumtische (4)", "desc": "Holztische fuer je 4 Personen. An einem sitzt ein verdaechtiger Reisender.", "player_desc": "Grobe Holztische mit Kerzenstummeln.", "visible": True},
                {"id": "c_geheimtuer", "cat": "door", "name": "Geheimtuer hinter der Theke", "desc": "Fuehrt in den Keller. Verdeckt durch ein Regal.", "player_desc": "Das Regal steht seltsam schief...", "visible": False, "locked": True, "detect": {"skill": "Sinnesschaerfe", "target": 14, "success": "Ihr bemerkt das schiefe Regal. Dahinter: eine schmale Tuer."}, "unlock": {"skill": "Kraftakt", "target": 10, "alt": "Regal wegschieben"}},
                {"id": "c_keller", "cat": "secret", "name": "Keller mit Diebesgut", "desc": "Gestohlene Waren (80 Silber Wert). Beweist Gregors Verwicklung in Rondriks Bande.", "visible": False},
                {"id": "c_privatzimmer", "cat": "door", "name": "Privatzimmer", "desc": "Fuer 2 Silber pro Nacht. Sicher zum Rasten.", "player_desc": "Eine Tuer zum Privatzimmer.", "visible": True, "locked": False},
                {"id": "c_speisen", "cat": "object", "name": "Speisekarte", "desc": "1 Silber pro Mahlzeit, 5 Heller pro Bier, 2 Silber fuer Zimmer.", "player_desc": "Warmer Braten und frisches Bier.", "visible": True},
            ],
            mood="mysterious",
            ambient_sound="tavern_rain",
            transitions=[
                {"label": "Dem Koehler folgen", "target_scene_title": "Der Koehler berichtet", "condition": "Koehler ist eingetroffen"},
                {"label": "Nordpfad erkunden", "target_scene_title": "Hinterhalt auf dem Nordpfad", "condition": "Gregor empfiehlt den Nordpfad"},
                {"label": "In der Taverne uebernachten", "target_scene_title": "Die Taverne zum Goldenen Keiler", "condition": "Helden wollen rasten"},
                {"label": "Keller untersuchen", "target_scene_title": "Der Koehler berichtet", "condition": "Geheimtuer gefunden"},
            ],
            status="upcoming",
            sort_order=1,
        )
        session.add(scene_1_1)
        counts["scenes"] += 1

        # Scene 1.2
        scene_1_2_id = _id()
        scene_1_2 = Scene(
            id=scene_1_2_id,
            chapter_id=chapter1_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Der Koehler berichtet",
            read_aloud=(
                "Die Tuer der Taverne fliegt auf, und ein durchnaesster Mann stolpert herein. "
                "Sein Gesicht ist kreidebleich, seine Haende zittern. Er sieht sich hektisch um, "
                "bevor sein Blick auf euch faellt. 'Ihr — ihr seht aus wie Leute, die kaempfen "
                "koennen!' Er laesst sich auf den naechsten Stuhl fallen und ringt nach Atem. "
                "'Im Turm... im alten Turm am Rabenfels... Orks! Dutzende! Und ihr Anfuehrer — "
                "ein Schamane mit gluehenden Augen. Ich habe ihn gesehen, wie er... Rituale "
                "durchfuehrt. Bei Nacht!' Er schluckt schwer. 'Es wird schlimmer. Viel schlimmer. "
                "Wenn niemand etwas tut...'"
            ),
            gm_notes=(
                "Der Koehler Alrik erzaehlt von den Orks im Turm. Wichtige Informationen:\n"
                "- Der Turm liegt einen Tagesmarsch noerdlich, am Rabenfels\n"
                "- Es sind etwa 10-15 Orks dort\n"
                "- Der Schamane fuehrt naechtliche Rituale durch\n"
                "- Alrik kennt einen geheimen Eingang (verraet er nur bei Vertrauen oder fuer Geld)\n"
                "- Er hat gehört, dass ein wertvolles Schwert im Turm ist\n\n"
                "PROBE: Menschenkenntnis gegen 8 — Alrik ist ehrlich verängstigt, sagt die Wahrheit.\n\n"
                "VERGÜTUNG: 10 Silbertaler fuer seine Dienste als Fuehrer (verhandelbar auf 5 "
                "bei erfolgreicher Ueberreden-Probe gegen 10). Wenn die Helden seine Ziegen finden, "
                "fuehrt er sie kostenlos."
            ),
            gm_secrets=[
                "Alrik hat den Orkschamanen aus der Ferne bei einem Ritual beobachtet",
                "Er weiss von einem unterirdischen Gang zum Turmkeller",
                "Er hat eine grob gezeichnete Karte des Turms (Handout)",
            ],
            npcs=[npc_koehler_id, npc_gregor_id],
            map_id=map_privatzimmer_id,
            content_list=[
                {"id": "c_koehler", "cat": "npc", "name": "Alrik der Koehler", "desc": "Veroengstigter Holzfaeller. Weiss vom Turm, kennt Geheimeingang.", "player_desc": "Ein durchnaesster, zitternder Mann stuerzt herein.", "visible": True, "probe": {"skill": "Menschenkenntnis", "target": 8, "success": "Er sagt die Wahrheit — seine Angst ist echt."}},
                {"id": "c_gregor2", "cat": "npc", "name": "Gregor der Wirt", "desc": "Hoert nervoes zu. Versucht das Gespraech vom Nordpfad abzulenken.", "player_desc": "Der Wirt hoert dem Koehler angespannt zu.", "visible": True},
                {"id": "c_karte", "cat": "object", "name": "Alriks Karte", "desc": "Grobe Karte auf Rinde. Zeigt Weg durch Dunkelwald zum Turm.", "player_desc": "Eine grobe Karte, in Baumrinde geritzt.", "visible": False},
                {"id": "c_verhandlung", "cat": "object", "name": "Fuehrungsangebot", "desc": "10 Silber fuer Fuehrung (Ueberreden gegen 10: auf 5 Silber). Gratis wenn Ziegen gefunden.", "player_desc": "Alrik bietet an, euch zum Turm zu fuehren.", "visible": True},
                {"id": "c_info_turm", "cat": "secret", "name": "Turm-Informationen", "desc": "10-15 Orks, Schamane mit naechtlichen Ritualen, wertvolles Schwert im Turm, Geheimeingang (nur bei Vertrauen).", "visible": False},
            ],
            mood="tense",
            ambient_sound="tavern_rain",
            transitions=[
                {"label": "Mit dem Koehler aufbrechen", "target_scene_title": "Durch den Dunkelwald", "condition": "Helden vereinbaren Fuehrung"},
                {"label": "Erst den Nordpfad untersuchen", "target_scene_title": "Hinterhalt auf dem Nordpfad", "condition": "Helden wollen Banditen aufklaeren"},
                {"label": "Alleine zum Turm aufbrechen", "target_scene_title": "Durch den Dunkelwald", "condition": "Helden gehen ohne Fuehrer"},
            ],
            handouts=[
                {"name": "Alriks Karte", "description": "Eine grob auf Rinde geritzte Karte, die den Weg vom Nordpfad durch den Dunkelwald zum Turm zeigt."},
            ],
            status="upcoming",
            sort_order=2,
        )
        session.add(scene_1_2)
        counts["scenes"] += 1

        # Scene 1.3
        scene_1_3_id = _id()
        scene_1_3 = Scene(
            id=scene_1_3_id,
            chapter_id=chapter1_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Hinterhalt auf dem Nordpfad",
            read_aloud=(
                "Der Pfad wird schmaler, waehrend die Baeume sich ueber euch zusammenschliessen "
                "wie die Rippen eines gewaltigen Tieres. Laub raschelt, aber es weht kein Wind. "
                "Ein umgestuerzter Baum versperrt den halben Weg, und ihr muesst einzeln daran "
                "vorbei. Dann hoert ihr es — das leise Knacken eines Zweigs, absichtlich zertreten. "
                "Eine Stimme ruft aus dem Dickicht: 'So, so! Reisende auf meinem Weg! Geld und "
                "Waffen auf den Boden — und vielleicht lasst ich euch weitergehen!'"
            ),
            gm_notes=(
                "KAMPFSZENE: Die Banditen lauern beidseitig des Pfades.\n\n"
                "GEGNER:\n"
                "- 3 Banditen (LeP 22, AT 12, PA 8, RS 2, TP 1W6+3 Kurzschwert)\n"
                "- 1 Banditenanfuehrer Rondrik (LeP 32, AT 14, PA 10, RS 3, TP 1W6+4 Langschwert)\n\n"
                "INITIATIVE: Banditen haben Ueberraschung (INI+2), es sei denn, die Helden haben "
                "eine erfolgreiche Sinnesschaerfe-Probe gegen 14 geschafft.\n\n"
                "TAKTIK: Die Banditen schiessen in Runde 1 mit Armbruesten (TP 1W6+4, RW kurz), "
                "dann greifen sie im Nahkampf an. Rondrik bleibt hinten und kommandiert.\n\n"
                "AUFGABE: Rondrik ergibt sich bei unter 8 LeP und bietet Informationen.\n\n"
                "BEUTE: 35 Silbertaler, 2 Heiltranke (schwach), Rondriks Langschwert (Qualitaet), "
                "gestohlene Ware (Stoff, Gewuerze, im Wert von 20 Silber)."
            ),
            gm_secrets=[
                "Rondrik kennt den Weg zum Turm und weiss von einem Seiteneingang",
                "Bei Rondrik findet man einen Brief von Gregor mit Hinweisen auf naechste Opfer",
                "Einer der Banditen hat eine Karte mit markierten Raubzuegen",
            ],
            npcs=[npc_rondrik_id],
            encounter_id="banditen_hinterhalt",
            map_id=map_nordpfad_id,
            content_list=[
                {"id": "c_bandit1", "cat": "enemy", "name": "Bandit 1", "desc": "Versteckt im Gebuesch links.", "visible": False, "stats": {"lep": 22, "lepMax": 22, "at": 12, "pa": 8, "rs": 2, "ini": 11, "tp": "1W6+3"}, "loot": [{"name": "Silbertaler", "qty": 8}]},
                {"id": "c_bandit2", "cat": "enemy", "name": "Bandit 2", "desc": "Versteckt im Gebuesch rechts.", "visible": False, "stats": {"lep": 22, "lepMax": 22, "at": 12, "pa": 8, "rs": 2, "ini": 11, "tp": "1W6+3"}, "loot": [{"name": "Heiltrank (schwach)", "qty": 1}]},
                {"id": "c_bandit3", "cat": "enemy", "name": "Bandit 3", "desc": "Blockiert den Rueckweg.", "visible": False, "stats": {"lep": 22, "lepMax": 22, "at": 12, "pa": 8, "rs": 2, "ini": 11, "tp": "1W6+3"}, "loot": [{"name": "Silbertaler", "qty": 7}]},
                {"id": "c_rondrik", "cat": "enemy", "name": "Rondrik der Bandit", "desc": "Anfuehrer. Ex-Soldat, charismatisch. Ergibt sich unter 8 LeP und bietet Infos.", "player_desc": "Ein grobschlaechiger Mann mit einer Narbe und spoerasischem Laecheln.", "visible": False, "stats": {"lep": 32, "lepMax": 32, "at": 14, "pa": 10, "rs": 3, "ini": 12, "tp": "1W6+4"}, "loot": [{"name": "Qualitaetslangschwert", "qty": 1}, {"name": "Silbertaler", "qty": 20}, {"name": "Heiltrank (schwach)", "qty": 1}]},
                {"id": "c_hinterhalt", "cat": "trap", "name": "Hinterhalt", "desc": "Banditen ueberraschen die Gruppe, sofern nicht erkannt.", "visible": False, "trigger": True, "detect": {"skill": "Sinnesschaerfe", "target": 14, "success": "Ihr bemerkt Bewegung in den Bueschen — Hinterhalt!", "failure": "Die Banditen springen ueberraschend hervor! Ueberraschungsrunde."}},
                {"id": "c_baum", "cat": "object", "name": "Umgestuerzter Baum", "desc": "Blockiert den Weg teilweise. Deckung moeglich.", "player_desc": "Ein riesiger umgestuerzter Baum versperrt den Pfad.", "visible": True},
                {"id": "c_gebuesch", "cat": "object", "name": "Dichtes Gebuesch", "desc": "Bietet Deckung. Banditen verstecken sich hier.", "player_desc": "Dichtes Unterholz zu beiden Seiten.", "visible": True},
                {"id": "c_beute", "cat": "treasure", "name": "Banditenbeute", "desc": "35 Silber, 2 Heiltrank (schwach), Qualitaetslangschwert, gestohlene Waren (20 Silber).", "visible": False},
            ],
            mood="dangerous",
            ambient_sound="forest_night",
            transitions=[
                {"label": "Banditen besiegt, weiter zum Turm", "target_scene_title": "Durch den Dunkelwald", "condition": "Kampf gewonnen"},
                {"label": "Rondrik verhören", "target_scene_title": "Der Koehler berichtet", "condition": "Rondrik hat sich ergeben"},
                {"label": "Zurueck zur Taverne", "target_scene_title": "Die Taverne zum Goldenen Keiler", "condition": "Helden kehren um"},
            ],
            status="upcoming",
            sort_order=3,
        )
        session.add(scene_1_3)
        counts["scenes"] += 1

        # --- Chapter 2: Der Weg zum Turm ---
        chapter2_id = _id()
        chapter2 = Chapter(
            id=chapter2_id,
            adventure_id=adventure_id,
            title="Der Weg zum Turm",
            summary=(
                "Die Helden reisen durch den Dunkelwald zum Turm des Orkschamanen. "
                "Auf dem Weg entdecken sie einen alten Wegschrein und treffen eine "
                "Perainepriesterin, die ihnen Hilfe und Informationen bietet."
            ),
            chapter_goal=(
                "Die Helden sollen den Turm erreichen und dabei Informationen ueber den "
                "Orkschamanen und seine Magie sammeln. Der Wegschrein bietet eine Moeglichkeit, "
                "sich zu heilen und vorzubereiten."
            ),
            sort_order=2,
        )
        session.add(chapter2)
        counts["chapters"] += 1

        # Scene 2.1
        scene_2_1_id = _id()
        scene_2_1 = Scene(
            id=scene_2_1_id,
            chapter_id=chapter2_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Durch den Dunkelwald",
            read_aloud=(
                "Der Wald verschluckt euch wie ein gieriger Schlund. Die Baeume stehen so dicht, "
                "dass selbst das schwache Mondlicht kaum den Boden erreicht. Jeder Schritt wird "
                "zur Herausforderung — Wurzeln greifen nach euren Fuessen, Dornenranken zerren an "
                "eurer Kleidung, und aus der Finsternis starren euch leuchtende Augenpaare an, die "
                "schnell wieder verschwinden. Der Koehler — sofern er bei euch ist — fuehrt euch "
                "auf einem schmalen Wildpfad, den nur er zu kennen scheint. 'Leise', fluestert er. "
                "'Die Woelfe sind in letzter Zeit... anders. Aggressiver. Seit die Orks da sind.'"
            ),
            gm_notes=(
                "REISESZENE: Die Gruppe muss durch den Dunkelwald wandern (ca. 8 Stunden).\n\n"
                "PROBEN:\n"
                "- Wildnisleben gegen 12 (mit Koehler: gegen 8) — um den Weg zu finden\n"
                "- Sinnesschaerfe gegen 10 — Wolfsspuren bemerken\n"
                "- Orientierung gegen 14 (ohne Koehler) — um nicht verloren zu gehen\n\n"
                "ZUFALLSBEGEGNUNG (W20):\n"
                "  1-5: Nichts passiert\n"
                "  6-10: Wolfsgeheul in der Ferne (Atmosphaere)\n"
                "  11-15: 3 Woelfe greifen an (LeP 15, AT 10, PA 5, TP 1W6+2)\n"
                "  16-18: Ein verlassenes Lager (3 Silbertaler, Hinweise auf Banditen)\n"
                "  19-20: Eine alte, von Moos ueberwucherte Steintafel mit zwergischen Runen\n\n"
                "ATMOSPHAERE: Betonen Sie die Dunkelheit, unheimliche Geraeusche, das Gefuehl, "
                "beobachtet zu werden. Dies baut Spannung fuer den Turm auf."
            ),
            gm_secrets=[
                "Wenn die Helden die Steintafel finden, koennen sie mit Sagen und Legenden (gegen 12) erfahren, dass hier frueher eine Zwergenmine war",
                "Die Woelfe werden vom Orkschamanen kontrolliert — bei genauerem Hinsehen haben sie gluehende Augen",
            ],
            npcs=[npc_koehler_id],
            map_id=map_dunkelwald_id,
            content_list=[
                {"id": "c_koehler_f", "cat": "npc", "name": "Alrik der Koehler (Fuehrer)", "desc": "Fuehrt die Gruppe. Gibt +2 auf Wildnisleben. Fluestert Warnungen.", "player_desc": "Der Koehler fuehrt euch auf einem schmalen Wildpfad.", "visible": True},
                {"id": "c_weg", "cat": "object", "name": "Wildpfad durch den Dunkelwald", "desc": "Schmal, verwachsen. 8 Stunden Marsch. Wurzeln und Dornen.", "player_desc": "Ein kaum erkennbarer Pfad windet sich durch dichtes Unterholz.", "visible": True},
                {"id": "c_probe_weg", "cat": "trap", "name": "Wegfindung", "desc": "Wildnisleben gegen 12 (mit Koehler: gegen 8). Bei Misserfolg: Verirrung (+2h).", "visible": False, "trigger": True, "detect": {"skill": "Wildnisleben", "target": 12, "success": "Ihr findet den Weg ohne Probleme.", "failure": "Ihr verirrt euch im Dickicht. 2 Stunden Verzoegerung."}},
                {"id": "c_woelfe", "cat": "enemy", "name": "3 Woelfe (Zufallsbegegnung 11-15)", "desc": "Magisch beeinflusst (gluehende Augen). Greifen an wenn W20 11-15.", "visible": False, "stats": {"lep": 15, "lepMax": 15, "at": 10, "pa": 5, "rs": 1, "ini": 12, "tp": "1W6+2"}, "trigger": True, "detect": {"skill": "Sinnesschaerfe", "target": 10, "success": "Ihr hoert Knurren — Woelfe! Ihr seid vorbereitet.", "failure": "Die Woelfe greifen aus dem Unterholz an!"}},
                {"id": "c_lager", "cat": "object", "name": "Verlassenes Lager", "desc": "Erloschene Feuerstelle. 3 Silbertaler. Banditenspuren (Faehrtensuchen gegen 8).", "player_desc": "Ueberreste eines Lagerfeuers im Unterholz.", "visible": False, "probe": {"skill": "Faehrtensuchen", "target": 8, "success": "Spuren fuehren zum Nordpfad — hier waren Banditen."}},
                {"id": "c_tafel", "cat": "object", "name": "Alte Steintafel", "desc": "Zwergische Runen. Sagen und Legenden gegen 12: Zwergenmine 'Granitfaust', Turm auf Ruinen gebaut.", "visible": False, "probe": {"skill": "Sagen und Legenden", "target": 12, "success": "Die Runen berichten von der Zwergenmine 'Granitfaust'. Der Turm steht auf ihren Ruinen."}},
                {"id": "c_augen", "cat": "atmosphere", "name": "Leuchtende Augen in der Dunkelheit", "desc": "Augenpaare beobachten die Gruppe. Verschwinden schnell. Unheimlich.", "player_desc": "Leuchtende Augenpaare starren euch aus der Finsternis an.", "visible": True},
                {"id": "c_geraeusche", "cat": "atmosphere", "name": "Unheimliche Waldgeraeusche", "desc": "Knackende Aeste, Eulenrufe, fernes Wolfsgeheul. Spannung aufbauen.", "player_desc": "Knackende Aeste und fernes Geheul.", "visible": True},
            ],
            mood="foreboding",
            ambient_sound="dark_forest",
            transitions=[
                {"label": "Weiter zum Wegschrein", "target_scene_title": "Der Wegschrein der Peraine", "condition": "Helden folgen dem Pfad"},
                {"label": "Verirrt im Wald", "target_scene_title": "Durch den Dunkelwald", "condition": "Orientierung fehlgeschlagen"},
                {"label": "Direkt zum Turm (Abkuerzung)", "target_scene_title": "Vor dem Turm", "condition": "Helden kennen den Weg oder haben Karte"},
            ],
            time_advance="8 Stunden",
            status="upcoming",
            sort_order=1,
        )
        session.add(scene_2_1)
        counts["scenes"] += 1

        # Scene 2.2
        scene_2_2_id = _id()
        scene_2_2 = Scene(
            id=scene_2_2_id,
            chapter_id=chapter2_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Der Wegschrein der Peraine",
            read_aloud=(
                "Zwischen den dunklen Staemmen oeffnet sich ploetzlich eine Lichtung, die wie eine "
                "Insel des Lichts wirkt. In der Mitte steht ein alter Steinaltar, ueberwuchert von "
                "bluehenden Rankenpflanzen, die trotz der Jahreszeit in vollem Gruen stehen. Eine "
                "goldene Aehre ziert den Altar — das Zeichen der Peraine, Goettin des Ackerbaus und "
                "der Heilung. Die Luft ist hier waermer, und ein sanfter Duft von Krautern liegt ueber "
                "der Lichtung. An einer steinernen Bank sitzt eine junge Frau in gruener Robe. Sie "
                "blickt auf, als ihr die Lichtung betretet, und laechelt wissend. 'Ich habe euch "
                "erwartet', sagt sie ruhig. 'Die Goettin hat mir eure Ankunft in einer Vision gezeigt.'"
            ),
            gm_notes=(
                "ENTDECKUNGSSZENE: Der Wegschrein ist ein Ort der Ruhe und Heilung.\n\n"
                "PERAINEPRIESTERIN ALENIA:\n"
                "- Kann die Helden heilen (bis zu 2W6+3 LeP pro Held)\n"
                "- Gibt Informationen ueber den Orkschamanen und seine Magie\n"
                "- Schenkt den Helden einen geweihten Dolch (+2 TP gegen daemonisch beeinflusste Wesen)\n"
                "- Warnt vor dem Alarm-Kristall in der Schamanenkammer\n\n"
                "PROBEN:\n"
                "- Magiekunde gegen 12: Die Helden erkennen, dass der Schrein eine Schutzmagie hat, "
                "die vom Orkschamanen teilweise gebrochen wurde\n"
                "- Goetter und Kulte gegen 10: Die Helden koennen den Schrein reinigen (Bonus: 3 Heiltranke)\n"
                "- Pflanzenkunde gegen 10: Athelas-Kraeuter finden (heilt 1W6 LeP bei Anwendung)\n\n"
                "LORE: Hier koennen die Helden die Geschichte des Turms und des Schwertes erfahren. "
                "Alenia weiss, dass das Schwert einst von Peraine gesegnet wurde und Daemonen bannen kann."
            ),
            gm_secrets=[
                "Alenia hat Visionen, dass der Orkschamane in 3 Tagen ein daemonisches Portal oeffnen will",
                "Der geweihte Dolch ist entscheidend fuer den Bosskampf — er durchbricht Grashnaks magischen Schutz",
                "Wenn die Helden den Schrein reinigen, wird er als Rueckzugsort freigeschaltet",
            ],
            npcs=[npc_alenia_id],
            map_id=map_lichtung_id,
            content_list=[
                {"id": "c_alenia", "cat": "npc", "name": "Perainepriesterin Alenia", "desc": "Sanfte Priesterin mit Visionen. Heilt bis 2W6+3 LeP pro Held. Gibt gesegneten Dolch.", "player_desc": "Eine Frau in gruenen Gewoendern strahlt uebernatuerliche Ruhe aus.", "visible": True},
                {"id": "c_altar", "cat": "object", "name": "Steinerner Wegschrein", "desc": "Uralter Altar der Peraine (goldene Aehre). Schutzmagie teilweise gebrochen.", "player_desc": "Ein uralter Steinaltar mit dem Symbol einer goldenen Aehre.", "visible": True, "probe": {"skill": "Goetter und Kulte", "target": 10, "success": "Peraine-Schrein. Kann gereinigt werden — Belohnung: 3 Heiltraenke."}},
                {"id": "c_dolch", "cat": "treasure", "name": "Gesegneter Dolch", "desc": "+2 TP gegen Daemonen-Beeinflusste. WICHTIG: Bricht Grashnaks magischen Schild (RS -2).", "player_desc": "Ein schlichter Dolch mit goldenem Griff, der leise vibriert.", "visible": False},
                {"id": "c_heilpflanzen", "cat": "object", "name": "Magische Heilpflanzen", "desc": "Pflanzenkunde gegen 10: Athelas-Kraeuter finden (heilt 1W6 LeP).", "player_desc": "Ungewoehnlich frische Pflanzen trotz der Jahreszeit.", "visible": True, "probe": {"skill": "Pflanzenkunde", "target": 10, "success": "Athelas-Kraeuter! Heilt 1W6 LeP pro Portion (3 Portionen)."}},
                {"id": "c_schrein_reinigen", "cat": "object", "name": "Schrein reinigen", "desc": "Goetter und Kulte gegen 10 + Gebet. Belohnung: 3 Heiltraenke + Schrein als Rueckzugsort.", "visible": False, "probe": {"skill": "Goetter und Kulte", "target": 10, "success": "Ihr reinigt den Schrein. 3 Heiltraenke erscheinen. Der Schrein strahlt wieder."}},
                {"id": "c_lore_turm", "cat": "secret", "name": "Alenias Wissen", "desc": "Turm-Geschichte, Schamane plant Daemonen-Tor in 3 Tagen, gesegneter Dolch bricht seinen Schild.", "visible": False},
                {"id": "c_lichtung", "cat": "atmosphere", "name": "Friedliche Lichtung", "desc": "Der Wald oeffnet sich. Licht, Vogelgesang, Frieden. Kontrast zur Dunkelheit.", "player_desc": "Eine friedliche Lichtung. Voegel singen, warmes Licht faellt ein.", "visible": True},
            ],
            mood="serene",
            ambient_sound="forest_clearing_birds",
            transitions=[
                {"label": "Weiter zum Turm", "target_scene_title": "Vor dem Turm", "condition": "Helden brechen auf"},
                {"label": "Am Schrein rasten", "target_scene_title": "Der Wegschrein der Peraine", "condition": "Helden wollen rasten und heilen"},
                {"label": "Zurueck in den Wald", "target_scene_title": "Durch den Dunkelwald", "condition": "Helden kehren um"},
            ],
            time_advance="2 Stunden",
            status="upcoming",
            sort_order=2,
        )
        session.add(scene_2_2)
        counts["scenes"] += 1

        # Scene 2.3
        scene_2_3_id = _id()
        scene_2_3 = Scene(
            id=scene_2_3_id,
            chapter_id=chapter2_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Vor dem Turm",
            read_aloud=(
                "Der Wald lichtet sich, und vor euch erhebt sich ein duesterer Anblick: Ein alter "
                "Steinturm, vier Stockwerke hoch, ragt wie ein fauler Zahn aus dem Felsgrat. Seine "
                "Mauern sind rissig, aber noch solide, und schmale Schiessscharten starren euch wie "
                "tote Augen an. Um den Turm herum erstreckt sich ein Vorplatz aus festgestampfter "
                "Erde, gesaeumt von groben Palisaden. Ein schwaches Lagerfeuer glimmt vor dem "
                "Eingangstor, und im Feuerschein seht ihr die massige Gestalt einer Wache, die sich "
                "auf eine Hellebarde stuetzt. Von oben, von der Turmspitze, flackert ein "
                "unheimliches gruenes Licht — der Schamane fuehrt seine Rituale durch."
            ),
            gm_notes=(
                "AUFKLAERUNGSSZENE: Die Helden sehen den Turm zum ersten Mal und koennen planen.\n\n"
                "GEGNER SICHTBAR:\n"
                "- 2 Orkraeuber auf Patrouille (kreisen um den Turm, alle 10 Minuten)\n"
                "- 1 Wache am Tor (doest, kann bestochen oder eingeschuechtert werden)\n\n"
                "OPTIONEN FUER DEN EINTRITT:\n"
                "1. Frontalangriff: Alle Orks im Vorplatz angreifen\n"
                "2. Schleichen: Schleichen gegen 14, am Turm entlang zum Geheimeingang\n"
                "3. Wache bestechen: 5 Silber oder Alkohol (Ueberreden gegen 10)\n"
                "4. Wache einschuechtern: Einschuechtern gegen 14\n"
                "5. Ablenkung: Feuer legen oder Laerm machen (kreativ!)\n"
                "6. Geheimeingang: Nur bekannt, wenn Koehler dabei ist oder Rondrik es verraten hat\n\n"
                "PROBEN:\n"
                "- Sinnesschaerfe gegen 10: Patrouillenmuster erkennen\n"
                "- Kriegskunst gegen 12: Schwachstellen der Verteidigung erkennen\n"
                "- Schleichen gegen 14: Unbemerkt naeher kommen"
            ),
            gm_secrets=[
                "Der Geheimeingang ist auf der Nordseite des Turms, hinter Gebuesch versteckt",
                "Die Patrouille hat eine Luecke von 5 Minuten alle 30 Minuten",
                "Das gruene Licht auf der Turmspitze ist ein Zeichen fuer ein laufendes Ritual",
            ],
            npcs=[npc_wache_id],
            encounter_id="turm_vorplatz",
            map_id=map_vorplatz_id,
            content_list=[
                {"id": "c_pat1", "cat": "enemy", "name": "Orkraeuber Patrouille 1", "desc": "Patrouilliert oestlich des Tors. 5-Minuten-Luecke alle 30 Minuten.", "visible": False, "stats": {"lep": 20, "lepMax": 20, "at": 11, "pa": 7, "rs": 2, "ini": 10, "tp": "1W6+4"}},
                {"id": "c_pat2", "cat": "enemy", "name": "Orkraeuber Patrouille 2", "desc": "Patrouilliert westlich. Schlaefrig nach Mitternacht.", "visible": False, "stats": {"lep": 20, "lepMax": 20, "at": 11, "pa": 7, "rs": 2, "ini": 10, "tp": "1W6+4"}},
                {"id": "c_wache", "cat": "npc", "name": "Wache am Tor", "desc": "Schlaefrig, bestechlich. 5 Silber oder Alkohol (Ueberreden gegen 10). Einschuechtern gegen 14.", "player_desc": "Ein schlaefrig aussehender Ork lehnt am Tor.", "visible": False, "probe": {"skill": "Ueberreden", "target": 10, "success": "Die Wache laesst euch durch. Sie nimmt das Silber und grunzt."}},
                {"id": "c_tor", "cat": "door", "name": "Turmtor", "desc": "Schweres Holztor. Bewacht. Offen wenn Wache bestochen/besiegt.", "player_desc": "Ein massives Holztor in der Turmmauer.", "visible": True, "locked": True, "unlock": {"skill": "Ueberreden/Einschuechtern/Kampf", "target": 10, "alt": "Wache bestechen (5 Silber), Einschuechtern (gegen 14), oder Kampf"}},
                {"id": "c_geheimgang", "cat": "door", "name": "Geheimer Seiteneingang", "desc": "Nur bekannt mit Koehler-Fuehrung oder Rondriks Info. Versteckt unter Rankenpflanzen.", "visible": False, "locked": True, "detect": {"skill": "Sinnesschaerfe", "target": 18, "success": "Ihr entdeckt einen verborgenen Eingang unter Ranken."}, "unlock": {"skill": "Kraftakt", "target": 8, "alt": "Ranken beiseite reissen"}},
                {"id": "c_lagerfeuer", "cat": "object", "name": "Lagerfeuer der Orks", "desc": "Gluehende Kohlen. Rest einer Mahlzeit.", "player_desc": "Ein schwach gluehendes Lagerfeuer.", "visible": True},
                {"id": "c_patrouille_probe", "cat": "trap", "name": "Patrouillen-Erkennung", "desc": "Sinnesschaerfe gegen 10: Muster erkennen (5-Min-Luecke). Kriegskunst gegen 12: Schwachstellen.", "visible": False, "trigger": True, "detect": {"skill": "Sinnesschaerfe", "target": 10, "success": "Ihr erkennt ein Muster — alle 30 Min eine 5-Minuten-Luecke."}},
                {"id": "c_schleichen", "cat": "trap", "name": "Heranschleichen", "desc": "Schleichen gegen 14 um unbemerkt ans Tor zu gelangen.", "visible": False, "trigger": True, "detect": {"skill": "Schleichen", "target": 14, "success": "Ihr schafft es unbemerkt zum Tor.", "failure": "Die Patrouillen entdecken euch! Alarm!"}},
                {"id": "c_gruenes_licht", "cat": "atmosphere", "name": "Gruenes Licht vom Turmgipfel", "desc": "Pulsierendes gruenes Leuchten. Das Ritual ist aktiv.", "player_desc": "Unheimliches gruenes Licht pulsiert an der Turmspitze.", "visible": True},
            ],
            mood="tense",
            ambient_sound="night_wind_wolves",
            transitions=[
                {"label": "In den Turm eindringen", "target_scene_title": "Das Erdgeschoss", "condition": "Helden betreten den Turm"},
                {"label": "Wache ueberwinden", "target_scene_title": "Das Erdgeschoss", "condition": "Wache besiegt/bestochen"},
                {"label": "Geheimeingang nutzen", "target_scene_title": "Die Folterkammer", "condition": "Geheimeingang bekannt"},
                {"label": "Zurueck zum Schrein", "target_scene_title": "Der Wegschrein der Peraine", "condition": "Helden ziehen sich zurueck"},
            ],
            status="upcoming",
            sort_order=3,
        )
        session.add(scene_2_3)
        counts["scenes"] += 1

        # --- Chapter 3: Im Turm des Schamanen ---
        chapter3_id = _id()
        chapter3 = Chapter(
            id=chapter3_id,
            adventure_id=adventure_id,
            title="Im Turm des Schamanen",
            summary=(
                "Die Helden erkunden den Turm des Orkschamanen, kaempfen gegen seine Waechter, "
                "befreien Gefangene, finden Schaetze und stellen sich schliesslich dem maechtig "
                "gewordenen Schamanen in seinem Ritualraum."
            ),
            chapter_goal=(
                "Die Helden muessen den Turm durchqueren, das Schwert des Koenigs finden und "
                "den Orkschamanen Grashnak besiegen. Nebenaufgaben: Gefangene befreien, "
                "Schaetze sichern, Balgras Vaters Axt finden."
            ),
            sort_order=3,
        )
        session.add(chapter3)
        counts["chapters"] += 1

        # Scene 3.1
        scene_3_1_id = _id()
        scene_3_1 = Scene(
            id=scene_3_1_id,
            chapter_id=chapter3_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Das Erdgeschoss",
            read_aloud=(
                "Das schwere Holztor knarrt, als ihr es aufstosst. Dahinter liegt eine dunkle "
                "Eingangshalle, in der es nach feuchtem Stein und ranzigem Fett stinkt. Fackeln "
                "flackern in rostigen Haltern und werfen zuckende Schatten an die Waende. Der Boden "
                "ist mit Knochen, zerbrochenem Geschirr und altem Stroh bedeckt. Rechts fuehrt ein "
                "Durchgang in einen Wachraum, aus dem grobes Gelachter und der Geruch von Grog "
                "dringt. Geradeaus fuehrt ein schmaler Korridor tiefer in den Turm. An den Waenden "
                "haengen grob geschnitzte Orkische Symbole — Zeichen, die selbst ohne magisches "
                "Wissen bedrohlich wirken."
            ),
            gm_notes=(
                "DUNGEON-SZENE: Das Erdgeschoss hat mehrere Raeume.\n\n"
                "RAEUME:\n"
                "1. Eingangshalle (sicher, aber dunkel)\n"
                "2. Wachraum (3 Orkraeuber + 1 Orkkrieger beim Trinken)\n"
                "3. Korridor (FALLE: Fallgrube, Sinnesschaerfe gegen 12)\n"
                "4. Folterkammer (hinten, Gefangener Praxus)\n"
                "5. Schatzkammer (verschlossen, Schloesserknacken gegen 14)\n"
                "6. Treppe nach oben (fuehrt zur Turmspitze)\n\n"
                "KAMPF IM WACHRAUM:\n"
                "- 3 Orkraeuber: LeP 20, AT 11, PA 7, RS 2, TP 1W6+4 (Orkisches Schwert)\n"
                "- 1 Orkkrieger: LeP 30, AT 13, PA 9, RS 3, TP 1W6+5 (Orkhauer)\n"
                "- Die Orks sind leicht betrunken: AT-1 in Runde 1\n"
                "- Bei Laerm kommen 2 weitere Orks aus dem Korridor (nach 3 Runden)\n\n"
                "SCHLEICHEN: Moeglichkeit, den Wachraum zu umgehen (Schleichen gegen 12)"
            ),
            gm_secrets=[
                "Im Wachraum liegt ein Schluessel zur Schatzkammer auf dem Tisch",
                "Die Fallgrube im Korridor kann mit einem Seil ueberbrueckt werden",
                "Ein Orkraeuber traegt einen Heiltrank am Guertel (1W6+2 LeP)",
            ],
            npcs=[],
            encounter_id="turm_erdgeschoss",
            map_id=map_turm_eg_id,
            content_list=[
                {"id": "c_ork1", "cat": "enemy", "name": "Orkraeuber 1", "desc": "Im Wachraum. Leicht betrunken (AT -1 Runde 1).", "visible": False, "stats": {"lep": 20, "lepMax": 20, "at": 11, "pa": 7, "rs": 2, "ini": 10, "tp": "1W6+4"}},
                {"id": "c_ork2", "cat": "enemy", "name": "Orkraeuber 2", "desc": "Im Wachraum. Wuerfelspiel.", "visible": False, "stats": {"lep": 20, "lepMax": 20, "at": 11, "pa": 7, "rs": 2, "ini": 10, "tp": "1W6+4"}},
                {"id": "c_ork3", "cat": "enemy", "name": "Orkraeuber 3", "desc": "Im Wachraum. Traegt Heiltrank (1W6+2 LeP).", "visible": False, "stats": {"lep": 20, "lepMax": 20, "at": 11, "pa": 7, "rs": 2, "ini": 10, "tp": "1W6+4"}, "loot": [{"name": "Heiltrank (schwach)", "qty": 1}]},
                {"id": "c_krieger", "cat": "enemy", "name": "Orkkrieger", "desc": "Im Wachraum. Stoerikerer Gegner. 2 weitere Orks kommen in Runde 3 bei Laerm.", "visible": False, "stats": {"lep": 30, "lepMax": 30, "at": 13, "pa": 9, "rs": 3, "ini": 11, "tp": "1W6+5"}},
                {"id": "c_eingangshalle", "cat": "object", "name": "Eingangshalle", "desc": "Dunkel. Knochen und Stroh am Boden. Fackelhalter an Waenden.", "player_desc": "Dunkel und stinkend. Knochen und Stroh liegen herum.", "visible": True},
                {"id": "c_wachraum_tuer", "cat": "door", "name": "Tuer zum Wachraum", "desc": "Holztuer. Nicht verschlossen. Lachen und Orkisch dahinter.", "player_desc": "Hinter der Tuer hoert ihr Lachen.", "visible": True, "locked": False},
                {"id": "c_schluessel", "cat": "object", "name": "Schluessel auf dem Tisch", "desc": "Passt zur Schatzkammer UND zu Praxus' Ketten.", "visible": False},
                {"id": "c_fallgrube", "cat": "trap", "name": "Fallgrube im Korridor", "desc": "2 Schritt tief. 1W6+2 Schaden. Ueberbrueckbar mit Seil.", "visible": False, "trigger": True, "detect": {"skill": "Sinnesschaerfe", "target": 12, "success": "Ihr bemerkt lose Bodenplatten — eine Falle!", "failure": "Der Boden bricht ein! 1W6+2 Schaden."}, "disarm": {"skill": "Koerperbeherrschung", "target": 10, "alt": "Seil drueber spannen"}},
                {"id": "c_korridor", "cat": "object", "name": "Korridor zum Suedteil", "desc": "Fuehrt zu Folterkammer und Treppe nach oben.", "player_desc": "Ein dunkler Gang fuehrt weiter in den Turm.", "visible": True},
                {"id": "c_tuer_folter", "cat": "door", "name": "Tuer zur Folterkammer", "desc": "Schwere Holztuer. Nicht verschlossen. Geruch von Blut.", "player_desc": "Ein uebler Geruch dringt unter der Tuer hervor.", "visible": True, "locked": False},
                {"id": "c_tuer_schatz", "cat": "door", "name": "Eisentuer zur Schatzkammer", "desc": "Verschlossen. Schloesserknacken gegen 14 oder Schluessel aus dem Wachraum.", "player_desc": "Eine schwere Eisentuer. Verschlossen.", "visible": True, "locked": True, "unlock": {"skill": "Schloesserknacken", "target": 14, "alt": "Schluessel aus dem Wachraum"}},
                {"id": "c_treppe", "cat": "door", "name": "Treppe nach oben", "desc": "Wendeltreppe. Fuehrt zur Kammer des Schamanen.", "player_desc": "Eine steinerne Wendeltreppe fuehrt nach oben.", "visible": True, "locked": False},
                {"id": "c_schleich_wach", "cat": "trap", "name": "Wachraum umgehen", "desc": "Schleichen gegen 12 um den Wachraum unbemerkt zu passieren.", "visible": False, "trigger": True, "detect": {"skill": "Schleichen", "target": 12, "success": "Ihr schleicht am Wachraum vorbei.", "failure": "Die Orks bemerken euch! Kampf!"}},
            ],
            mood="dangerous",
            ambient_sound="dungeon_dripping",
            transitions=[
                {"label": "Zur Folterkammer", "target_scene_title": "Die Folterkammer", "condition": "Helden gehen in den Korridor"},
                {"label": "Zur Schatzkammer", "target_scene_title": "Die Schatzkammer", "condition": "Helden haben Schluessel oder knacken Schloss"},
                {"label": "Treppe nach oben", "target_scene_title": "Die Kammer des Schamanen", "condition": "Helden nehmen die Treppe"},
            ],
            triggers=[
                {"type": "trap", "name": "Fallgrube", "position": [2, 4], "probe": "Sinnesschaerfe gegen 12"},
            ],
            status="upcoming",
            sort_order=1,
        )
        session.add(scene_3_1)
        counts["scenes"] += 1

        # Scene 3.2
        scene_3_2_id = _id()
        scene_3_2 = Scene(
            id=scene_3_2_id,
            chapter_id=chapter3_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Die Folterkammer",
            read_aloud=(
                "Der Geruch von Blut und Verzweiflung schlaegt euch entgegen, noch bevor ihr den "
                "Raum betretet. Rostige Ketten haengen von der Decke, und an der Wand lehnen "
                "grausame Werkzeuge, deren Zweck man lieber nicht ergründen moechte. In der Ecke, "
                "an eine Eisenstange gekettet, kauert ein Mann in zerrissenen Kleidern. Er hebt "
                "muehsam den Kopf, als er euch bemerkt. Sein Gesicht ist geschwollen und blutig, "
                "aber in seinen Augen flammt Hoffnung auf. 'Beim Praios... seid ihr echte Menschen? "
                "Bitte... bitte holt mich hier raus. Die Orks... sie kommen jede Nacht zurueck.'"
            ),
            gm_notes=(
                "RETTUNGSSZENE: Der Haendler Praxus ist hier gefangen.\n\n"
                "PRAXUS:\n"
                "- LeP 8/26, Zustand: Schmerz II\n"
                "- Kann geheilt werden (Heilkunde Wunden gegen 8 oder Magie)\n"
                "- Erzaehlt alles, was er weiss (siehe NPC-Profil)\n"
                "- Bietet 20 Dukaten Belohnung (50, wenn als Koenigsagent erkannt)\n\n"
                "MORALISCHE ENTSCHEIDUNG:\n"
                "Option A: Praxus sofort befreien — er kann nicht kaempfen und verlangsamt die Gruppe\n"
                "Option B: Praxus spaeter holen — Risiko, dass die Orks ihn vorher toeten\n"
                "Option C: Praxus die Ketten loesen und er versteckt sich — braucht Schloesserknacken gegen 10\n\n"
                "BEFREIUNG:\n"
                "- Ketten sprengen: Kraftakt gegen 14\n"
                "- Schloss knacken: Schloesserknacken gegen 10\n"
                "- Schluessel: Im Wachraum auf dem Tisch\n\n"
                "BELOHNUNG: Praxus verraet die Position der Schatzkammer und dass das Schwert oben ist."
            ),
            gm_secrets=[
                "Praxus ist ein Agent des Koenigs — Menschenkenntnis gegen 14 oder Etikette gegen 12",
                "Er kennt das Geheimnis des Schwertes: Es kann den Daemonenpakt des Schamanen brechen",
                "Er hat im Turm andere Gefangene gesehen, die fuer Rituale geopfert wurden",
            ],
            npcs=[npc_praxus_id],
            map_id=map_folterkammer_id,
            content_list=[
                {"id": "c_praxus", "cat": "npc", "name": "Haendler Praxus (gefangen)", "desc": "LeP 8/26, Schmerz II. Koenigsagent (Menschenkenntnis 14 oder Etikette 12). Bietet 20 Dukaten (50 als Agent).", "player_desc": "Ein blutiger, gebrochener Mann in Ketten. Hoffnung flammt in seinen Augen.", "visible": True, "stats": {"lep": 8, "lepMax": 26}},
                {"id": "c_ketten", "cat": "door", "name": "Praxus' Ketten", "desc": "Koennen geloest werden.", "player_desc": "Schwere Eisenketten.", "visible": True, "locked": True, "unlock": {"skill": "Schloesserknacken", "target": 10, "alt": "Kraftakt gegen 14, oder Schluessel aus dem Wachraum"}},
                {"id": "c_heilung", "cat": "trap", "name": "Praxus heilen", "desc": "Heilkunde Wunden gegen 8 oder Magie noetig.", "visible": False, "trigger": True, "detect": {"skill": "Heilkunde Wunden", "target": 8, "success": "Ihr versorgt seine Wunden. Schmerz sinkt auf Stufe I.", "failure": "Ihr koennt ihm nur wenig helfen. Er braucht einen Heiler."}},
                {"id": "c_folterwerkzeuge", "cat": "object", "name": "Folterwerkzeuge", "desc": "Grausame Instrumente. Koennen als improvisierte Waffen dienen.", "player_desc": "Rostige, grausame Werkzeuge an der Wand.", "visible": True},
                {"id": "c_eisengitter", "cat": "door", "name": "Eisengitter zum Gefangenenbereich", "desc": "Trennt Hauptraum vom Gefangenen. Verschlossen.", "player_desc": "Eiserne Gitterstaebe.", "visible": True, "locked": True, "unlock": {"skill": "Schloesserknacken", "target": 10, "alt": "Kraftakt gegen 14 oder Schluessel"}},
                {"id": "c_praxus_info", "cat": "secret", "name": "Praxus' Informationen", "desc": "Position der Schatzkammer, Schwert ist OBEN beim Schamanen, andere Gefangene fuer Rituale.", "visible": False},
                {"id": "c_moral", "cat": "secret", "name": "Moralische Entscheidung", "desc": "A: Sofort befreien (verlangsamt). B: Spaeter holen (Risiko). C: Ketten loesen, verstecken lassen.", "visible": False},
                {"id": "c_blut", "cat": "atmosphere", "name": "Blut und Verzweiflung", "desc": "Geruch von Blut. Ketten rasseln. Tropfendes Wasser.", "player_desc": "Der Geruch von Blut und Verzweiflung haengt in der Luft.", "visible": True},
            ],
            mood="dark",
            ambient_sound="dungeon_chains",
            transitions=[
                {"label": "Zurueck zum Erdgeschoss", "target_scene_title": "Das Erdgeschoss", "condition": "Helden gehen zurueck"},
                {"label": "Zur Schatzkammer", "target_scene_title": "Die Schatzkammer", "condition": "Praxus verraet den Weg"},
                {"label": "Treppe nach oben", "target_scene_title": "Die Kammer des Schamanen", "condition": "Helden gehen nach oben"},
            ],
            status="upcoming",
            sort_order=2,
        )
        session.add(scene_3_2)
        counts["scenes"] += 1

        # Scene 3.3
        scene_3_3_id = _id()
        scene_3_3 = Scene(
            id=scene_3_3_id,
            chapter_id=chapter3_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Die Schatzkammer",
            read_aloud=(
                "Die schwere Eisentuer schwingt auf und gibt den Blick frei auf einen kleinen Raum, "
                "der im Schein eurer Fackeln golden glaenzt. Muenzen und Edelsteine liegen in groben "
                "Holzkisten gestapelt, daneben stehen Waffenstaender mit orkischen und menschlichen "
                "Waffen. An der Wand haengt ein praechtiges Wandteppich mit dem Wappen des Koenigs — "
                "offensichtlich Diebesgut. In einer Ecke liegt ein Haufen zusammengerollter Karten "
                "und Dokumente. Doch Vorsicht — etwas an der Art, wie die Kisten aufgestellt sind, "
                "wirkt... absichtlich."
            ),
            gm_notes=(
                "SCHATZ- UND FALLENSZENE:\n\n"
                "TUER:\n"
                "- Verschlossen: Schloesserknacken gegen 14 oder Schluessel aus dem Wachraum\n"
                "- FALLE an der Tuer: Giftpfeilfalle (Sinnesschaerfe gegen 14 zum Entdecken)\n"
                "  Betaeubungsgift Stufe 3, 1W3 Schadenspunkte\n"
                "  Entschaerfen: Mechanik gegen 12\n\n"
                "BEUTE:\n"
                "- 120 Silbertaler und 15 Dukaten in Muenzen\n"
                "- 3 Edelsteine (je 10 Dukaten wert)\n"
                "- 1 Qualitaetslangschwert (+1 TP)\n"
                "- 1 Kettenhemd (RS 4, gut erhalten)\n"
                "- Orkischer Ritualstab (Magiekunde gegen 10: magisch, +1 auf Antimagie-Proben)\n"
                "- Karten und Dokumente (Hinweise auf weitere Ork-Aktivitaeten in der Region)\n"
                "- QUEST-GEGENSTAND: Das Schwert des Koenigs ist NICHT hier — es ist oben!\n\n"
                "HINWEIS: Praxus erwaehnt, dass das wichtigste Schwert oben beim Schamanen liegt."
            ),
            gm_secrets=[
                "Unter den Dokumenten ist ein Brief an Grashnak von einem unbekannten 'Meister'",
                "Der Brief deutet auf eine groessere Verschwoerung hin (Plot-Hook fuer Fortsetzung)",
                "Das Qualitaetslangschwert gehoerte einem Ritter, der vom Schamanen getötet wurde",
            ],
            npcs=[],
            map_id=map_schatzkammer_id,
            content_list=[
                {"id": "c_tuer_falle", "cat": "trap", "name": "Giftpfeilfalle an der Tuer", "desc": "Beim Oeffnen: vergiftete Nadeln. 1W3 SP + Betaeubungsgift Stufe 3.", "visible": False, "trigger": True, "detect": {"skill": "Sinnesschaerfe", "target": 14, "success": "Winzige Loecher in der Wand — Falle!", "failure": "Vergiftete Nadeln treffen euch! 1W3 SP + Betaeubungsgift Stufe 3."}, "disarm": {"skill": "Mechanik", "target": 12}},
                {"id": "c_muenzen", "cat": "treasure", "name": "Muenzkisten", "desc": "120 Silbertaler und 15 Dukaten.", "player_desc": "Holzkisten voller glaenzender Muenzen.", "visible": True},
                {"id": "c_edelsteine", "cat": "treasure", "name": "3 Edelsteine", "desc": "Je 10 Dukaten wert.", "player_desc": "Drei geschliffene Edelsteine funkeln im Fackelschein.", "visible": True},
                {"id": "c_schwert_q", "cat": "treasure", "name": "Qualitaetslangschwert", "desc": "+1 TP. Gehoerte einem Ritter, der vom Schamanen getoetet wurde.", "player_desc": "Ein praechtiges Langschwert in einer verzierten Scheide.", "visible": True},
                {"id": "c_kettenhemd", "cat": "treasure", "name": "Kettenhemd", "desc": "RS 4, gut erhalten.", "player_desc": "Ein sauber gepflegtes Kettenhemd.", "visible": True},
                {"id": "c_ritualstab", "cat": "treasure", "name": "Orkischer Ritualstab", "desc": "Magisch (+1 auf Antimagie). Magiekunde gegen 10 enthuellt Funktion.", "player_desc": "Ein knorriger Stab mit eingeritzten Runen.", "visible": True, "probe": {"skill": "Magiekunde", "target": 10, "success": "Magischer Stab! +1 auf Antimagie-Proben."}},
                {"id": "c_teppich", "cat": "object", "name": "Koenigsteppich", "desc": "Wappen des Koenigs. Offensichtlich gestohlen.", "player_desc": "Ein praechtiger Wandteppich mit koeniglichem Wappen.", "visible": True},
                {"id": "c_dokumente", "cat": "object", "name": "Karten und Dokumente", "desc": "Hinweise auf weitere Ork-Aktivitaeten in der Region.", "player_desc": "Ein Haufen zusammengerollter Karten und Dokumente.", "visible": True},
                {"id": "c_brief", "cat": "secret", "name": "Brief des 'Meisters'", "desc": "Brief an Grashnak von unbekanntem Auftraggeber. Groessere Verschwoerung. Plot-Hook.", "visible": False},
                {"id": "c_kein_schwert", "cat": "secret", "name": "HINWEIS: Koenigsschwert fehlt!", "desc": "Das Schwert des Koenigs ist NICHT hier — es ist oben beim Schamanen!", "visible": False},
            ],
            mood="tempting",
            ambient_sound="dungeon_silence",
            transitions=[
                {"label": "Treppe nach oben", "target_scene_title": "Die Kammer des Schamanen", "condition": "Helden haben die Schatzkammer geplündert"},
                {"label": "Zurueck zur Folterkammer", "target_scene_title": "Die Folterkammer", "condition": "Helden wollen Praxus befreien"},
            ],
            triggers=[
                {"type": "trap", "name": "Giftpfeilfalle", "position": [8, 7], "probe": "Sinnesschaerfe gegen 14"},
            ],
            status="upcoming",
            sort_order=3,
        )
        session.add(scene_3_3)
        counts["scenes"] += 1

        # Scene 3.4 — BOSS FIGHT
        scene_3_4_id = _id()
        scene_3_4 = Scene(
            id=scene_3_4_id,
            chapter_id=chapter3_id,
            campaign_id=campaign_id,
            adventure_id=adventure_id,
            title="Die Kammer des Schamanen",
            read_aloud=(
                "Die Wendeltreppe endet vor einer schweren Steintuer, hinter der gruenes Licht "
                "pulsiert. Als ihr die Tuer aufstosst, trifft euch eine Welle aus Hitze und dem "
                "beissenden Geruch von verbranntem Weihrauch. Die kreisrunde Kammer an der Spitze "
                "des Turms ist in unheimliches Licht getaucht. Auf dem Boden erstreckt sich ein "
                "riesiger Ritualkreis aus leuchtenden Runen, in dessen Mitte ein steinerner Altar "
                "steht. Auf dem Altar liegt ein praechtiges Schwert — das Schwert des Koenigs — und "
                "es pulsiert im gleichen Rhythmus wie die Runen. Hinter dem Altar steht ER: "
                "Orkschamane Grashnak, die Arme erhoben, die rot gluehenden Augen auf euch gerichtet. "
                "Neben ihm steht sein massiger Leibwaechter Urruk, die zwergische Streitaxt erhoben. "
                "Zwei weitere Orkkrieger flankieren den Raum. Grashnak senkt langsam die Arme und "
                "grinst — ein Grinsen voller spitzer Zaehne. 'Grashnak hat euch erwartet', "
                "grummelt er. 'Ihr kommt genau richtig — fuer das Opfer.'"
            ),
            gm_notes=(
                "BOSS-KAMPF! Dies ist der Hoehepunkt des Abenteuers.\n\n"
                "GEGNER:\n"
                "1. Orkschamane Grashnak: LeP 38, AsP 45, RS 2, INI 12+1W6\n"
                "   Zauber: Horriphobus (Angst, MU-Probe gegen 16 oder Flucht),\n"
                "           Corpofesso (2W6 SP, ignoriert RS),\n"
                "           Ignifaxius (2W6+4 TP, Reichweite 16 Schritt),\n"
                "           Paralysis (Laehmen, 3 KR, KO-Probe gegen 14)\n"
                "   Taktik R1: Horriphobus auf staerksten Nahkaempfer\n"
                "   Taktik R2-3: Corpofesso oder Ignifaxius auf Fernkaempfer\n"
                "   Unter 15 LeP: Paralysis auf alle, versucht zu fliehen\n\n"
                "2. Orkhauptling Urruk: LeP 42, AT 15, PA 9, RS 4, TP 1W6+6, INI 11+1W6\n"
                "   Traegt 'Gramzorn' (zwergische Streitaxt, +1 TP gegen Daemonen)\n"
                "   Kaempft bis zum Tod, ergibt sich aber, wenn Grashnak faellt\n"
                "   Wuchtschlag bei jedem Angriff (+2 TP, -2 AT, effektiv AT 13, TP 1W6+8)\n\n"
                "3. Orkkrieger 1 & 2: LeP 30, AT 13, PA 9, RS 3, TP 1W6+5, INI 10+1W6\n\n"
                "ALARM-KRISTALL:\n"
                "- Wenn der Kristall nicht deaktiviert wurde: Grashnak beginnt den Kampf mit "
                "  einem vorbereiteten Horriphobus (Probe -2 fuer die Helden)\n"
                "- Wenn deaktiviert: Ueberraschungsrunde fuer die Helden!\n\n"
                "SIEGBEDINGUNG: Grashnak besiegen und das Schwert vom Altar nehmen.\n\n"
                "SCHWERT DES KOENIGS:\n"
                "- Kann waehrend des Kampfes vom Altar genommen werden (Koerperbeherrschung gegen 10 "
                "  wegen des Ritualkreises, oder einfach greifen mit 1W6 Schaden durch magische Energie)\n"
                "- Wenn jemand das Schwert ergreift: Grashnaks Schild bricht zusammen (RS -2)\n\n"
                "BALGRAS VATERS AXT:\n"
                "- Wenn Balgra im Kampf Urruk sieht: Sinnesschaerfe gegen 8 oder automatisch bei "
                "  Kampf mit Urruk — er erkennt die Runen auf der Axt 'Gramzorn' als die seines Vaters\n"
                "- Moralischer Moment: Urruk hat die Axt von Grashnaks Trupp erhalten, der Balgras "
                "  Vater toetete\n\n"
                "NACH DEM KAMPF:\n"
                "- Schwert des Koenigs geborgen: Hauptquest abgeschlossen\n"
                "- Gramzorn erlangt: Balgras persoenliche Quest abgeschlossen\n"
                "- Grashnak ueberlebt (gefangen): Kann verhoert werden (groessere Verschwoerung!)\n"
                "- Turm klar: Die Region ist sicher — vorerst"
            ),
            gm_secrets=[
                "Grashnak hat einen letzten Trumpf: Wenn er unter 5 LeP faellt, versucht er, den Elementar im Schwert zu befreien (Chaos-Event)",
                "Wenn das Schwert vom Altar genommen wird, explodiert der Ritualkreis (1W6 Schaden, alle im Kreis)",
                "Urruk traegt unter seiner Ruestung ein Amulett, das Grashnaks Kontrolle ueber ihn aufrechthaelt — wenn zerstoert, kaempft Urruk gegen Grashnak",
                "Hinter dem Altar ist eine Truhe mit Grashnaks persoenlichem Tagebuch — Plot-Hook fuer das naechste Abenteuer",
            ],
            npcs=[npc_grashnak_id, npc_urruk_id],
            encounter_id="bosskampf_schamane",
            map_id=map_turmspitze_id,
            content_list=[
                {"id": "c_grashnak", "cat": "enemy", "name": "Orkschamane Grashnak", "desc": "BOSS. Zauber: Horriphobus (MU gegen 16), Corpofesso (2W6 ign. RS), Ignifaxius (2W6+4), Paralyse (KO gegen 14). Unter 15 LeP: Fluchtversuch. Schwaeche: Gesegneter Dolch bricht Schild (RS -2).", "player_desc": "Ein maechtiger Ork mit rot gluehenden Augen und erhobenen Armen.", "visible": True, "stats": {"lep": 38, "lepMax": 38, "at": 10, "pa": 6, "rs": 2, "ini": 12, "asp": 45, "tp": "Zauber"}},
                {"id": "c_urruk", "cat": "enemy", "name": "Orkhauptling Urruk", "desc": "Massiver Krieger. Traegt Gramzorn (Balgras Vaters Axt, +1 TP vs Daemonen). Wuchtschlag jede Runde (+2 TP, eff. AT 13). Ergibt sich wenn Grashnak faellt. Amulett unter Ruestung kontrolliert ihn.", "player_desc": "Ein riesiger Ork mit einer zwergischen Streitaxt.", "visible": True, "stats": {"lep": 42, "lepMax": 42, "at": 15, "pa": 9, "rs": 4, "ini": 11, "tp": "1W6+6 (Wucht: +8)"}},
                {"id": "c_krieger1", "cat": "enemy", "name": "Orkkrieger 1", "desc": "Flankiert den Eingang.", "visible": True, "stats": {"lep": 30, "lepMax": 30, "at": 13, "pa": 9, "rs": 3, "ini": 10, "tp": "1W6+5"}},
                {"id": "c_krieger2", "cat": "enemy", "name": "Orkkrieger 2", "desc": "Schuetzt den Schamanen.", "visible": True, "stats": {"lep": 30, "lepMax": 30, "at": 13, "pa": 9, "rs": 3, "ini": 10, "tp": "1W6+5"}},
                {"id": "c_alarm", "cat": "trap", "name": "Alarmkristall", "desc": "Neben der Treppe. Wenn nicht deaktiviert: Grashnak vorgewarnt (Horriphobus -2 fuer Helden).", "visible": False, "trigger": True, "detect": {"skill": "Sinnesschaerfe", "target": 10, "success": "Ein schwach glimmender Kristall — Alarmsystem!"}, "disarm": {"skill": "Magiekunde", "target": 10, "alt": "Kraftakt gegen 8 (zerschlagen)"}},
                {"id": "c_schwert", "cat": "treasure", "name": "Schwert des Koenigs", "desc": "QUEST-ZIEL. Auf dem Altar. Pulsiert im Rhythmus der Runen. Nehmen: Koerperbeherrschung gegen 10 (oder 1W6 Magieschaden). Bricht Grashnaks Schild.", "player_desc": "Ein praechtiges Schwert pulsiert auf dem Steinaltar.", "visible": True},
                {"id": "c_altar", "cat": "object", "name": "Steinaltar", "desc": "Zentrum des Ritualkreises. Schwert liegt darauf.", "player_desc": "Ein massiver Steinaltar im Zentrum des Raumes.", "visible": True},
                {"id": "c_ritualkreis", "cat": "object", "name": "Leuchtender Ritualkreis", "desc": "Schwieriges Gelaende. Explodiert bei Schwert-Entnahme (1W6 Schaden an alle im Kreis).", "player_desc": "Leuchtende Runen bilden einen grossen Kreis auf dem Boden.", "visible": True},
                {"id": "c_steintuer", "cat": "door", "name": "Schwere Steintuer (Eingang)", "desc": "Kann leise geoeffnet werden (Schleichen gegen 14) oder aufgestossen.", "player_desc": "Eine schwere Steintuer am Treppenaufgang.", "visible": True, "locked": False},
                {"id": "c_amulett", "cat": "secret", "name": "Urruks Kontrollamulett", "desc": "Unter seiner Ruestung. Wenn zerstoert: Urruk wendet sich gegen Grashnak!", "visible": False},
                {"id": "c_tagebuch", "cat": "secret", "name": "Grashnaks Tagebuch", "desc": "Hinter dem Altar in einer Truhe. Plot-Hook: Hinweise auf einen Meister und groessere Verschwoerung.", "visible": False},
                {"id": "c_gramzorn", "cat": "secret", "name": "Gramzorn (Balgras Quest)", "desc": "Sinnesschaerfe gegen 8: Balgra erkennt die Axt seines Vaters. Persoenlicher Quest-Abschluss.", "visible": False},
                {"id": "c_ritual_atmo", "cat": "atmosphere", "name": "Ritualatmosphaere", "desc": "Gruenes pulsierendes Licht, Hitze, Weihrauchgeruch, donnernde Gesaenge.", "player_desc": "Gruenes Licht pulsiert. Hitze und beissender Weihrauch. Donnernde Gesaenge.", "visible": True},
            ],
            mood="epic",
            ambient_sound="ritual_chanting_thunder",
            transitions=[
                {"label": "Sieg! Schwert geborgen", "target_scene_title": None, "condition": "Grashnak besiegt, Schwert genommen"},
                {"label": "Rueckzug!", "target_scene_title": "Das Erdgeschoss", "condition": "Helden ziehen sich zurueck"},
            ],
            status="upcoming",
            sort_order=4,
        )
        session.add(scene_3_4)
        counts["scenes"] += 1

        # Set campaign current_scene_id to first scene
        campaign.current_scene_id = scene_1_1_id

        # ==================================================================
        # 6. CREATE QUESTS
        # ==================================================================
        quest_hauptquest_id = _id()
        quest_ziegen_id = _id()
        quest_rondrik_id = _id()
        quest_axt_id = _id()

        # Find Balgra's character for personal quest assignment
        balgra_char = None
        for cp in session.query(CampaignPlayer).filter_by(campaign_id=campaign_id).all():
            from models.character import Character
            char = session.get(Character, cp.character_id)
            if char and "Balgra" in char.name:
                balgra_char = char
                break

        quests_data = [
            Quest(
                id=quest_hauptquest_id,
                campaign_id=campaign_id,
                title="Das Schwert des Koenigs",
                description=(
                    "Das legendaere Schwert des Koenigs wurde von dem Orkschamanen Grashnak gestohlen. "
                    "Findet den Turm des Schamanen, dringt ein und bringt das Schwert zurueck, bevor "
                    "der Schamane es fuer seine finsteren Rituale missbrauchen kann."
                ),
                type="main",
                status="active",
                given_by=npc_koehler_id,
                reward_description="50 Dukaten vom koeniglichen Kurier, Ruhm und Ehre, koenigliche Anerkennung",
                objectives=[
                    {"title": "Den Turm finden", "status": "active", "description": "Folgt dem Koehler durch den Dunkelwald zum Turm des Orkschamanen."},
                    {"title": "In den Turm eindringen", "status": "upcoming", "description": "Findet einen Weg in den Turm — durch das Tor, den Geheimeingang oder mit List."},
                    {"title": "Das Schwert des Koenigs bergen", "status": "upcoming", "description": "Besiegt den Orkschamanen Grashnak und nehmt das Schwert vom Altar."},
                ],
                gm_notes=(
                    "Dies ist die Hauptquest des Abenteuers. Die drei Ziele muessen in der Reihenfolge "
                    "abgeschlossen werden. Bonus-Belohnung: Wenn Grashnak lebend gefangen wird, "
                    "erhoehen sich die Dukaten auf 75. Wenn die Helden auch die Gefangenen befreien, "
                    "gibt es zusaetzlich 25 Dukaten vom Haendler Praxus."
                ),
                created_session=1,
            ),
            Quest(
                id=quest_ziegen_id,
                campaign_id=campaign_id,
                title="Die verschwundenen Ziegen",
                description=(
                    "Der Koehler Alrik vermisst seine Ziegenherde, die nahe dem Nordpfad verschwunden "
                    "ist. Wahrscheinlich wurden sie von Banditen oder Woelfen gerissen. Findet heraus, "
                    "was passiert ist."
                ),
                type="side",
                status="active",
                given_by=npc_koehler_id,
                reward_description="Kostenlose Fuehrung durch den Dunkelwald, 5 Silbertaler, Alriks Dankbarkeit",
                objectives=[
                    {"title": "Die Ziegen suchen", "status": "active", "description": "Sucht entlang des Nordpfades nach Spuren der Ziegen."},
                    {"title": "Das Schicksal der Ziegen aufklaeren", "status": "upcoming", "description": "Findet heraus, was mit den Ziegen passiert ist."},
                ],
                gm_notes=(
                    "Die Ziegen wurden von Rondriks Banditen gestohlen und in ihrem Lager geschlachtet. "
                    "Die Helden finden Ueberreste im Banditenlager. Wenn sie Rondrik besiegen und Alrik "
                    "davon berichten, fuehrt er sie kostenlos durch den Wald. Faehrtensuchen gegen 10 "
                    "am Nordpfad fuehrt zu den Spuren."
                ),
                created_session=1,
            ),
            Quest(
                id=quest_rondrik_id,
                campaign_id=campaign_id,
                title="Rondriks Bande",
                description=(
                    "Reisende auf dem Nordpfad werden ueberfallen. Gerüchte deuten auf eine "
                    "organisierte Bande hin. Untersucht die Ueberfaelle und stellt die Verantwortlichen."
                ),
                type="side",
                status="active",
                reward_description="Belohnung von 50 Dukaten fuer Rondriks Gefangennahme, oder 25 bei Beweisen seines Todes",
                objectives=[
                    {"title": "Die Ueberfaelle untersuchen", "status": "active", "description": "Sammelt Informationen ueber die Banditenangriffe am Nordpfad."},
                    {"title": "Die Bande konfrontieren", "status": "upcoming", "description": "Findet und stellt Rondrik und seine Banditen."},
                    {"title": "Gregors Verwicklung aufdecken", "status": "upcoming", "description": "Findet heraus, ob der Wirt in die Ueberfaelle verwickelt ist."},
                ],
                gm_notes=(
                    "Diese Quest verbindet sich mit dem Hinterhalt auf dem Nordpfad. Gregors Rolle "
                    "als Komplize kann durch Menschenkenntnis (gegen 12), den Brief bei Rondrik oder "
                    "die Geheimtuer hinter der Theke aufgedeckt werden. Wenn Gregor konfrontiert wird, "
                    "gesteht er und bittet um Gnade fuer sich und seinen Bruder. Die Helden koennen "
                    "Rondrik nach Gareth bringen (Belohnung) oder ihn laufen lassen."
                ),
                created_session=1,
            ),
            Quest(
                id=quest_axt_id,
                campaign_id=campaign_id,
                title="Vaters Axt",
                description=(
                    "Balgra Felszorn sucht seit langem nach der Streitaxt seines Vaters — 'Gramzorn', "
                    "eine uralte zwergische Waffe. Geruechten zufolge gelangte sie in den Besitz eines "
                    "Ork-Haeuptlings. Koennte der Orkturm die Antwort sein?"
                ),
                type="personal",
                assigned_to=str(balgra_char.id) if balgra_char else None,
                status="active",
                reward_description="Gramzorn (Streitaxt, TP 1W6+5, +1 gegen Daemonen), innerer Frieden, Abschluss",
                objectives=[
                    {"title": "Hinweise auf Gramzorn sammeln", "status": "active", "description": "Erfahrt mehr ueber das Schicksal der Axt eures Vaters."},
                    {"title": "Gramzorn finden", "status": "upcoming", "description": "Findet die Axt im Turm des Orkschamanen."},
                    {"title": "Gramzorn zurueckfordern", "status": "upcoming", "description": "Besiegt den Traeger der Axt und nehmt sie zurueck."},
                ],
                gm_notes=(
                    "Persoenliche Quest fuer Balgra. Urruk traegt die Axt. Wenn Balgra Urruk im Kampf "
                    "sieht, erkennt er die Axt automatisch oder mit einer leichten Sinnesschaerfe-Probe. "
                    "Dies ist ein emotionaler Moment — der Spieler sollte die Moeglichkeit haben, "
                    "darauf zu reagieren. Gramzorn hat die Werte: TP 1W6+5, Laenge: mittel, +1 TP "
                    "gegen daemonisch beeinflusste Wesen. Es ist eine Waffe von grossem sentimentalem "
                    "und materiellem Wert."
                ),
                created_session=1,
            ),
        ]

        for quest in quests_data:
            session.add(quest)
            counts["quests"] += 1

        # ==================================================================
        # 7. CREATE LORE ENTRIES
        # ==================================================================
        lore_entries_data = [
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="location",
                title="Taverne zum Goldenen Keiler",
                player_text=(
                    "Eine kleine, gemuetliche Taverne am Rande des Dunkelwaldes, etwa zwei Tagesreisen "
                    "noerdlich von Gareth. Benannt nach dem ausgestopften Wildschweinkopf ueber dem Kamin. "
                    "Der Wirt Gregor bietet einfache, aber herzhafte Kost und guenstiges Bier. Die Taverne "
                    "dient als Raststation fuer Reisende auf dem Weg in die noerdlichen Doerfer."
                ),
                gm_text=(
                    "Die Taverne ist ein Knotenpunkt fuer Rondriks Banditenoperationen. Gregor leitet "
                    "ahnungslose Reisende auf den Nordpfad, wo sie ueberfallen werden. Im Keller der "
                    "Taverne lagert ein Teil der Beute. Die Geheimtuer hinter der Theke fuehrt ueber "
                    "eine schmale Treppe in den Keller. Dort finden die Helden gestohlene Waren im "
                    "Wert von etwa 80 Silbertalern sowie einen Brief von Rondrik an Gregor."
                ),
                first_encountered="Praios 15, 1041 BF",
                tags=["taverne", "nordpfad", "rondrik", "gregor"],
                linked_npcs=[npc_gregor_id, npc_rondrik_id],
                linked_quests=[quest_rondrik_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="location",
                title="Der Nordpfad",
                player_text=(
                    "Ein schmaler Waldweg, der vom Hauptweg abzweigt und eine Abkuerzung in die noerdlichen "
                    "Doerfer bieten soll. Der Pfad fuehrt durch dichten Wald und ist stellenweise zugewachsen. "
                    "In letzter Zeit meiden Reisende diesen Weg — Geruechte ueber Ueberfaelle machen die Runde."
                ),
                gm_text=(
                    "Der Nordpfad ist das Operationsgebiet von Rondriks Bande. An der engsten Stelle, "
                    "wo ein umgestuerzter Baum den Weg teilweise versperrt, lauern die Banditen im "
                    "Gebuesch. Sie haben Sichtlinien von beiden Seiten und nutzen den Baum als Deckung. "
                    "Rondrik selbst haelt sich im Hintergrund und greift erst ein, wenn die Opfer "
                    "eingekreist sind. Die Banditen ueberfallen etwa zwei- bis dreimal pro Woche."
                ),
                first_encountered="Praios 15, 1041 BF",
                tags=["weg", "wald", "banditen", "gefahr"],
                linked_npcs=[npc_rondrik_id],
                linked_quests=[quest_rondrik_id, quest_ziegen_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="location",
                title="Der Turm des Orkschamanen",
                player_text=(
                    "Ein uralter Steinturm am Rabenfels, tief im Dunkelwald. Vier Stockwerke hoch, "
                    "umgeben von groben Palisaden. Der Turm wurde vor Jahrhunderten von Zwergen erbaut "
                    "und diente verschiedenen Besitzern, bevor er in Vergessenheit geriet. Seit kurzem "
                    "hat der Orkschamane Grashnak ihn besetzt und nutzt ihn als Basis fuer seine "
                    "dunklen Rituale. Nachts flackert gruenes Licht auf der Turmspitze."
                ),
                gm_text=(
                    "Der Turm wurde urspruenglich von dem zwergischen Schmied Dorin Eisenhand als "
                    "Werkstatt erbaut (daher die zwergischen Relikte im Inneren). Nach Dorins Tod "
                    "verfiel er und wurde von verschiedenen Banditen und Ausgestossenen genutzt. "
                    "Grashnak entdeckte ihn vor sechs Monaten und erkannte die magischen Residuen "
                    "der alten zwergischen Schmiedekunst. Er nutzt diese Residualmagie, um seine "
                    "eigenen Rituale zu verstaerken. Der Turm hat einen Geheimgang auf der Nordseite, "
                    "der vom Wald direkt in den Keller fuehrt (den Keller hat Dorin als Lager genutzt)."
                ),
                first_encountered="Praios 15, 1041 BF",
                tags=["turm", "dungeon", "orks", "magie", "zwerge"],
                linked_npcs=[npc_grashnak_id, npc_urruk_id],
                linked_quests=[quest_hauptquest_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="person",
                title="Orkschamane Grashnak",
                player_text=(
                    "Ein maechtig gewordener Orkschamane, der den alten Turm am Rabenfels besetzt hat. "
                    "Geruechte sprechen von unheimlichen Ritualen bei Nacht und einer wachsenden Ork-Praesenz "
                    "im Dunkelwald. Der Koehler Alrik hat ihn aus der Ferne gesehen: eine massige Gestalt "
                    "in dunkler Robe mit rot gluehenden Augen."
                ),
                gm_text=(
                    "Grashnak war einst ein Schueler des Schwarzmagiers Borondion, der ihn in den "
                    "Grundlagen der Daemonologie unterrichtete, bevor er ihn verstoss. Grashnak "
                    "kombiniert orkische Schamanenmagie mit menschlicher Schwarzmagie und hat einen "
                    "Pakt mit einem niederen Daemonen geschlossen. Das Schwert des Koenigs, das "
                    "einen gebundenen Elementar enthaelt, will er nutzen, um ein Portal in die "
                    "Niedere Daemonensphare zu oeffnen. Sein Plan ist es, eine Daemonenarmee zu "
                    "beschwören, um die umliegenden Doerfer zu unterwerfen."
                ),
                first_encountered="Praios 15, 1041 BF",
                tags=["antagonist", "ork", "schamane", "magie", "daemon"],
                linked_npcs=[npc_grashnak_id],
                linked_quests=[quest_hauptquest_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="item",
                title="Das Schwert des Koenigs",
                player_text=(
                    "Ein legendaeres Schwert aus der Bosparanischen Aera, das seit Generationen im "
                    "Besitz der koeniglichen Familie ist. Es wird bei Kroenungszeremonien und "
                    "wichtigen Staatsanlaessen getragen. Vor drei Wochen wurde es einem Kurier "
                    "auf dem Weg nach Gareth gestohlen. Das Schwert ist etwa vier Spann lang, mit "
                    "einer goldverzierten Parierstange und einem Griff aus Drachenleder."
                ),
                gm_text=(
                    "Das Schwert enthaelt einen gebundenen Feuerelementar, der bei der Herstellung "
                    "in der Bosparanischen Aera eingeschlossen wurde. Dieser Elementar verleiht der "
                    "Klinge magische Schaerfe (+2 TP) und die Faehigkeit, Daemonen zu verletzen. "
                    "Grashnak braucht den Elementar, um sein Portal zu oeffnen. Wenn ein Held das "
                    "Schwert ergreift, spuert er eine warme Energie, die durch seine Hand stroemt. "
                    "Ein Magier erkennt mit Odem Arcanum die gebundene Entitaet. Das Schwert wurde "
                    "einst von einer Perainepriesterin geweiht, was seine Anti-Daemonen-Wirkung erklaert."
                ),
                first_encountered="Praios 15, 1041 BF",
                tags=["artefakt", "quest", "schwert", "magie", "koenig"],
                linked_npcs=[npc_grashnak_id, npc_praxus_id],
                linked_quests=[quest_hauptquest_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="faction",
                title="Rondriks Bande",
                player_text=(
                    "Eine Gruppe von etwa fuenf bis acht Banditen, die Reisende auf dem Nordpfad "
                    "ueberfallen. Ihr Anfuehrer scheint ein erfahrener Kaempfer zu sein. Die "
                    "Ueberfaelle haben in den letzten Wochen zugenommen, und die oertlichen "
                    "Behoerden haben eine Belohnung von 50 Dukaten fuer die Ergreifung des Anfuehrers "
                    "ausgesetzt."
                ),
                gm_text=(
                    "Rondrik, ehemaliger Soldat und Deserteur, hat die Bande vor zwei Jahren "
                    "gegruendet. Sein Bruder Gregor, der Wirt, leitet Reisende gezielt auf den "
                    "Nordpfad. Die Bande besteht aus: Rondrik (Anfuehrer), 3 Banditen (ehemalige "
                    "Soldaten und Bauern), 2 spaehende Ausspaher (in der Gegend unterwegs). "
                    "Ihr Lager liegt abseits des Nordpfads in einer kleinen Hoehle. Die gestohlene "
                    "Beute wird teilweise in Gregors Keller gelagert, teilweise nach Gareth verkauft."
                ),
                first_encountered="Praios 15, 1041 BF",
                tags=["banditen", "nordpfad", "rondrik", "gregor", "nebenquest"],
                linked_npcs=[npc_rondrik_id, npc_gregor_id],
                linked_quests=[quest_rondrik_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="location",
                title="Der Wegschrein der Peraine",
                player_text=(
                    "Ein alter Steinschrein in einer Lichtung im Dunkelwald, geweiht der Goettin "
                    "Peraine. Trotz des verfallenden Zustands bluehen die Pflanzen um den Schrein "
                    "in unnatuerlicher Pracht. Eine Perainepriesterin namens Alenia huetet den Schrein "
                    "und bietet Reisenden Heilung und Rat. Der Schrein strahlt eine beruhigende Aura aus."
                ),
                gm_text=(
                    "Der Schrein war einst ein bedeutender Tempel der Peraine, der den gesamten Wald "
                    "beschuetzte. Durch Grashnaks Rituale wurde die Schutzmagie teilweise gebrochen. "
                    "Wenn die Helden den Schrein reinigen (Goetter und Kulte gegen 12), wird die "
                    "Schutzmagie wiederhergestellt und der Wald beginnt sich zu erholen. Alenia hat "
                    "Visionen von der Zukunft des Waldes — wenn Grashnak nicht aufgehalten wird, "
                    "wird der gesamte Dunkelwald zu einem Ort des Boesen."
                ),
                first_encountered="Praios 16, 1041 BF",
                tags=["schrein", "peraine", "heilung", "magie", "wald"],
                linked_npcs=[npc_alenia_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="location",
                title="Die Ogerruine",
                player_text=(
                    "Im suedoestlichen Teil des Dunkelwaldes liegen die Ueberreste einer alten "
                    "Festung, von der die Einheimischen sagen, sie sei von Ogern erbaut worden. "
                    "Niemand geht freiwillig dorthin — es heisst, dass die Ruine verflucht sei. "
                    "Manchmal sieht man nachts Lichter zwischen den zerbrochenen Mauern."
                ),
                gm_text=(
                    "Die Ogerruine ist ein Plot-Hook fuer ein moegliches Folgeabenteuer. Hier lebt "
                    "tatsaechlich ein alter Oger namens Grombruk, der von Grashnak als Verbündeter "
                    "angeworben werden soll. Grombruk hat noch nicht zugestimmt — wenn die Helden "
                    "ihn finden, koennten sie ihn ueberzeugen, neutral zu bleiben oder sogar gegen "
                    "Grashnak zu helfen. Die Ruine enthaelt auch Hinweise auf den 'Meister', der "
                    "Grashnak Anweisungen gibt."
                ),
                first_encountered="Praios 16, 1041 BF",
                tags=["ruine", "oger", "folgeabenteuer", "dunkelwald"],
                reveals=["Die Ogerruine hat eine Verbindung zu Grashnaks geheimem Auftraggeber"],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="location",
                title="Die Stadt Gareth",
                player_text=(
                    "Die Hauptstadt des Mittelreiches und groesste Stadt Aventuriens. Gareth liegt "
                    "etwa zwei Tagesreisen suedlich des Dunkelwaldes. Hier residiert der Koenig, "
                    "und die Stadt ist das Zentrum von Handel, Politik und Gelehrsamkeit. Das "
                    "Schwert des Koenigs sollte dorthin gebracht werden, als es gestohlen wurde."
                ),
                gm_text=(
                    "Gareth ist der Ausgangspunkt und das Ziel des Abenteuers. Wenn die Helden das "
                    "Schwert zurueckbringen, werden sie am Hof empfangen. Der Koenig bietet ihnen "
                    "eine groessere Aufgabe an: Die Quelle von Grashnaks Macht aufzuspueren — den "
                    "'Meister', der hinter den Kulissen die Faeden zieht. Dies ist der Uebergang "
                    "zum naechsten Abenteuer. In Gareth koennen die Helden auch Belohnungen einloesen "
                    "und Ausruestung kaufen."
                ),
                first_encountered="Praios 13, 1041 BF",
                tags=["stadt", "gareth", "mittelreich", "koenig", "hintergrund"],
                linked_quests=[quest_hauptquest_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="item",
                title="Zwergische Relikte im Turm",
                player_text=(
                    "Im Turm des Orkschamanen finden sich Spuren seiner zwergischen Erbauer: "
                    "kunstvoll gemeisselte Steinmetzarbeiten, Runen an den Waenden und vereinzelte "
                    "zwergische Artefakte. Die Qualitaet der Arbeit deutet auf einen meisterhaften "
                    "Schmied hin, der hier einst gewirkt hat."
                ),
                gm_text=(
                    "Der Turm wurde von Dorin Eisenhand erbaut, einem der letzten grossen zwergischen "
                    "Schmiede des Amboss-Clans. Dorins Schmiede befand sich im Keller des Turms, "
                    "wo er legendaere Waffen schuf — darunter auch 'Gramzorn', die Axt von Balgras "
                    "Vater. Dorin starb vor etwa 200 Jahren, und sein Wissen ging mit ihm verloren. "
                    "Die Runen an den Waenden sind Schutzrunen, die den Turm vor magischen Angriffen "
                    "schuetzen sollten — Grashnak hat sie teilweise fuer seine eigenen Zwecke "
                    "umfunktioniert. Ein Zwerg kann mit Steinbearbeitung (gegen 10) die Geschichte "
                    "der Runen lesen."
                ),
                first_encountered="Praios 17, 1041 BF",
                tags=["zwerge", "artefakt", "turm", "schmiede", "runen"],
                linked_quests=[quest_axt_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="event",
                title="Der Diebstahl des Schwertes",
                player_text=(
                    "Vor etwa drei Wochen wurde ein koeniglicher Kurier auf dem Weg nach Gareth "
                    "ueberfallen. Der Kurier transportierte das Schwert des Koenigs in einer "
                    "verschlossenen Truhe. Die Angreifer waren Orks — ungewoehnlich organisiert "
                    "und zielstrebig. Der Kurier ueberlebte schwer verletzt und berichtete, dass "
                    "die Orks genau wussten, was sie suchten."
                ),
                gm_text=(
                    "Der Ueberfall war von Grashnak geplant, der durch seinen Pakt mit dem Daemonen "
                    "Kenntnis ueber den Transport erlangt hatte. Der 'Meister' hinter Grashnak "
                    "— ein menschlicher Schwarzmagier namens Borondion — hatte die Route des Kuriers "
                    "in Erfahrung gebracht und Grashnak informiert. Der Kurier ueberlebte nur, weil "
                    "Grashnaks Orks ihn fuer tot hielten. Praxus, der koenigliche Agent, wurde "
                    "ausgesandt, um das Schwert zurueckzuholen, und wurde dabei ebenfalls gefangen."
                ),
                first_encountered="Praios 15, 1041 BF",
                tags=["diebstahl", "schwert", "orks", "kurier", "plot"],
                linked_npcs=[npc_grashnak_id, npc_praxus_id],
                linked_quests=[quest_hauptquest_id],
            ),
            LoreEntry(
                id=_id(),
                campaign_id=campaign_id,
                category="discovery",
                title="Grashnaks Daemonenpakt",
                player_text=(
                    "Es gibt Hinweise darauf, dass der Orkschamane Grashnak seine Macht nicht allein "
                    "aus orkischer Schamanenmagie bezieht. Magische Spuren am Wegschrein und die Art "
                    "seiner Rituale deuten auf dunklere Quellen hin."
                ),
                gm_text=(
                    "Grashnak hat einen Pakt mit dem Daemonen 'Thargunitoth' geschlossen, einem "
                    "niederen Dienst-Daemonen des Namenlosen. Der Pakt verleiht ihm zusaetzliche "
                    "magische Kraft, fordert aber regelmaessige Opfer — daher die Gefangenen im Turm. "
                    "Das Schwert des Koenigs mit seinem gebundenen Elementar soll als Schluessel "
                    "dienen, um ein dauerhaftes Portal zu oeffnen. Wenn die Helden das Amulett unter "
                    "Urruks Ruestung zerstoeren, bricht Grashnaks Kontrolle ueber seine Krieger zusammen. "
                    "Der Daemonenpakt ist auch die Quelle fuer Grashnaks 'rote Augen'."
                ),
                first_encountered="Praios 16, 1041 BF",
                tags=["daemon", "magie", "grashnak", "pakt", "geheim"],
                linked_npcs=[npc_grashnak_id],
                linked_quests=[quest_hauptquest_id],
                reveals=["Grashnak hat einen Pakt mit einem Daemonen, der ihm uebermenschliche Macht verleiht"],
            ),
        ]

        for lore in lore_entries_data:
            session.add(lore)
            counts["lore_entries"] += 1

        # ==================================================================
        # 8. CREATE TIMELINE EVENTS
        # ==================================================================
        timeline_events_data = [
            TimelineEvent(
                id=_id(),
                campaign_id=campaign_id,
                game_date="Praios 15, 1041 BF",
                game_time="Abend",
                session_number=1,
                event_type="arrival",
                title="Ankunft in der Taverne zum Goldenen Keiler",
                description=(
                    "Die Helden erreichen an einem regnerischen Abend die Taverne zum Goldenen Keiler "
                    "am Rande des Dunkelwaldes. Der Wirt Gregor begruesst sie nervoes."
                ),
                characters_involved=["Balgra Felszorn", "Elara Sternenfunke", "Thorben Praiosmund", "Yara Falkenauge"],
                npcs_involved=[npc_gregor_id],
            ),
            TimelineEvent(
                id=_id(),
                campaign_id=campaign_id,
                game_date="Praios 15, 1041 BF",
                game_time="Spaetabend",
                session_number=1,
                event_type="quest",
                title="Der Koehler bringt Neuigkeiten",
                description=(
                    "Der Koehler Alrik stuermt in die Taverne und berichtet atemlos von Orks im "
                    "alten Turm am Rabenfels. Er bietet an, die Helden zum Turm zu fuehren."
                ),
                characters_involved=["Balgra Felszorn", "Elara Sternenfunke", "Thorben Praiosmund", "Yara Falkenauge"],
                npcs_involved=[npc_koehler_id, npc_gregor_id],
                linked_quest=quest_hauptquest_id,
            ),
            TimelineEvent(
                id=_id(),
                campaign_id=campaign_id,
                game_date="Praios 16, 1041 BF",
                game_time="Morgen",
                session_number=1,
                event_type="travel",
                title="Aufbruch durch den Dunkelwald",
                description=(
                    "Die Helden brechen im Morgengrauen auf und folgen dem Koehler durch den dichten "
                    "Dunkelwald. Der Weg ist beschwerlich, und unheimliche Geraeusche begleiten sie."
                ),
                characters_involved=["Balgra Felszorn", "Elara Sternenfunke", "Thorben Praiosmund", "Yara Falkenauge"],
                npcs_involved=[npc_koehler_id],
            ),
            TimelineEvent(
                id=_id(),
                campaign_id=campaign_id,
                game_date="Praios 16, 1041 BF",
                game_time="Nachmittag",
                session_number=1,
                event_type="discovery",
                title="Entdeckung des Wegschreins der Peraine",
                description=(
                    "Die Helden stossen auf eine Lichtung mit einem alten Peraineschrein. Die "
                    "Priesterin Alenia erwartet sie und warnt vor dem Orkschamanen und seiner "
                    "daemonischen Magie."
                ),
                characters_involved=["Balgra Felszorn", "Elara Sternenfunke", "Thorben Praiosmund", "Yara Falkenauge"],
                npcs_involved=[npc_alenia_id],
            ),
            TimelineEvent(
                id=_id(),
                campaign_id=campaign_id,
                game_date="Praios 17, 1041 BF",
                game_time="Daemmerung",
                session_number=2,
                event_type="combat",
                title="Ankunft am Turm des Orkschamanen",
                description=(
                    "Die Helden erreichen den Turm bei Einbruch der Daemmerung. Sie beobachten die "
                    "Wachen, planen ihren Angriff und bereiten sich auf den Sturm auf den Turm vor. "
                    "Gruenes Licht flackert unheimlich auf der Turmspitze."
                ),
                characters_involved=["Balgra Felszorn", "Elara Sternenfunke", "Thorben Praiosmund", "Yara Falkenauge"],
                npcs_involved=[npc_wache_id, npc_grashnak_id],
                linked_quest=quest_hauptquest_id,
            ),
            TimelineEvent(
                id=_id(),
                campaign_id=campaign_id,
                game_date="Praios 17, 1041 BF",
                game_time="Nacht",
                session_number=2,
                event_type="combat",
                title="Sturm auf den Turm",
                description=(
                    "Die Helden dringen in den Turm ein und kaempfen sich durch das Erdgeschoss. "
                    "Sie entdecken den gefangenen Haendler Praxus und die Schatzkammer."
                ),
                characters_involved=["Balgra Felszorn", "Elara Sternenfunke", "Thorben Praiosmund", "Yara Falkenauge"],
                npcs_involved=[npc_praxus_id],
                linked_quest=quest_hauptquest_id,
            ),
            TimelineEvent(
                id=_id(),
                campaign_id=campaign_id,
                game_date="Praios 17, 1041 BF",
                game_time="Mitternacht",
                session_number=2,
                event_type="combat",
                title="Konfrontation mit dem Orkschamanen",
                description=(
                    "Die Helden steigen die Treppe hinauf und stellen sich dem Orkschamanen Grashnak "
                    "und seinem Leibwaechter Urruk in der Ritualkammer auf der Turmspitze."
                ),
                characters_involved=["Balgra Felszorn", "Elara Sternenfunke", "Thorben Praiosmund", "Yara Falkenauge"],
                npcs_involved=[npc_grashnak_id, npc_urruk_id],
                linked_quest=quest_hauptquest_id,
            ),
        ]

        for event in timeline_events_data:
            session.add(event)
            counts["timeline_events"] += 1

        # ==================================================================
        # 9. CREATE GAME SESSION (pre-populated, not active)
        # ==================================================================
        session_1_id = _id()
        game_session_1 = GameSession(
            id=session_1_id,
            campaign_id=campaign_id,
            session_number=1,
            session_code="ORKS-S01",
            status="ended",
            recap_text=(
                "Die Helden trafen sich in der Taverne zum Goldenen Keiler, wo der Koehler Alrik "
                "von Orks im alten Turm am Rabenfels berichtete. Sie vereinbarten, ihm zum Turm "
                "zu folgen, und brachen am naechsten Morgen auf. Im Dunkelwald entdeckten sie den "
                "Wegschrein der Peraine und erhielten von der Priesterin Alenia wichtige Hinweise "
                "ueber den Orkschamanen und seine daemonische Magie."
            ),
            gm_notes=(
                "Sitzung 1 verlief gut. Die Spieler sind motiviert. Balgra hat noch nicht von der "
                "Axt erfahren — das kommt in Sitzung 2 beim Bosskampf. Elara hat den Schrein "
                "gereinigt, was ihr 3 Heiltranke einbrachte. Die Gruppe hat den Nordpfad nicht "
                "erkundet — Rondriks Bande ist also noch aktiv."
            ),
        )
        session.add(game_session_1)
        counts["game_sessions"] += 1

        # Session logs
        session_logs_data = [
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="scene",
                data={
                    "scene": "Die Taverne zum Goldenen Keiler",
                    "summary": "Helden treffen ein, lernen Gregor kennen",
                },
            ),
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="probe",
                data={
                    "character": "Elara Sternenfunke",
                    "talent": "Menschenkenntnis",
                    "difficulty": 12,
                    "result": "Erfolg (QS 2)",
                    "note": "Elara bemerkt, dass Gregor etwas verbirgt",
                },
            ),
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="scene",
                data={
                    "scene": "Der Koehler berichtet",
                    "summary": "Alrik erzaehlt von den Orks, Gruppe vereinbart Fuehrung",
                },
            ),
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="quest",
                data={
                    "quest": "Das Schwert des Koenigs",
                    "action": "accepted",
                    "note": "Hauptquest angenommen",
                },
            ),
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="scene",
                data={
                    "scene": "Durch den Dunkelwald",
                    "summary": "Reise durch den Wald, keine Zufallsbegegnung",
                },
            ),
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="probe",
                data={
                    "character": "Yara Falkenauge",
                    "talent": "Wildnisleben",
                    "difficulty": 8,
                    "result": "Erfolg (QS 3)",
                    "note": "Yara fuehrt die Gruppe sicher mit dem Koehler",
                },
            ),
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="scene",
                data={
                    "scene": "Der Wegschrein der Peraine",
                    "summary": "Treffen mit Alenia, Heilung, geweihter Dolch erhalten",
                },
            ),
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="probe",
                data={
                    "character": "Thorben Praiosmund",
                    "talent": "Goetter und Kulte",
                    "difficulty": 12,
                    "result": "Erfolg (QS 1)",
                    "note": "Schrein gereinigt, 3 Heiltranke erhalten",
                },
            ),
            SessionLog(
                id=_id(),
                session_id=session_1_id,
                entry_type="lore",
                data={
                    "lore_entry": "Der Wegschrein der Peraine",
                    "action": "discovered",
                    "note": "Spieler haben den Schrein entdeckt und erkundet",
                },
            ),
        ]

        for log_entry in session_logs_data:
            session.add(log_entry)
            counts["session_logs"] += 1

        # ==================================================================
        # COMMIT ALL
        # ==================================================================
        session.commit()
        log.info("All data committed successfully.")

    return counts


# ===========================================================================
# CLI entry point
# ===========================================================================
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed the 'Der Turm des Orkschamanen' demo adventure."
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Override sync database URL (default: from .env / config).",
    )
    args = parser.parse_args()

    counts = seed_adventure(database_url=args.database_url)

    log.info("")
    log.info("=== ADVENTURE SEED SUMMARY ===")
    for entity, count in counts.items():
        log.info("  %-20s %d", entity, count)
    log.info("")
    total = sum(counts.values())
    log.info("  Total entities created: %d", total)
    log.info("")
    log.info("=== ADVENTURE STRUCTURE ===")
    log.info("  Adventure: Der Turm des Orkschamanen")
    log.info("  Chapter 1: Der Hilferuf (3 scenes)")
    log.info("    - Die Taverne zum Goldenen Keiler")
    log.info("    - Der Koehler berichtet")
    log.info("    - Hinterhalt auf dem Nordpfad")
    log.info("  Chapter 2: Der Weg zum Turm (3 scenes)")
    log.info("    - Durch den Dunkelwald")
    log.info("    - Der Wegschrein der Peraine")
    log.info("    - Vor dem Turm")
    log.info("  Chapter 3: Im Turm des Schamanen (4 scenes)")
    log.info("    - Das Erdgeschoss")
    log.info("    - Die Folterkammer")
    log.info("    - Die Schatzkammer")
    log.info("    - Die Kammer des Schamanen")
    log.info("")
    log.info("  NPCs: 8 (Gregor, Alrik, Rondrik, Grashnak, Urruk, Praxus, Wache, Alenia)")
    log.info("  Maps: 6 (Taverne, Nordpfad, Lichtung, Vorplatz, Turm EG, Turmspitze)")
    log.info("  Quests: 4 (1 main, 2 side, 1 personal)")
    log.info("  Lore Entries: 12")
    log.info("  Timeline Events: 7")
    log.info("")
    log.info("  Campaign 'ORKTURM-42' is now fully populated!")
