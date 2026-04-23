from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session
from config import get_settings

settings = get_settings()

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Sync engine for seeding
sync_engine = create_engine(settings.DATABASE_URL_SYNC, echo=False)


# Enable WAL mode and foreign keys for SQLite
if "sqlite" in settings.DATABASE_URL:
    @event.listens_for(sync_engine, "connect")
    def _set_sqlite_pragma_sync(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma_async(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        # Enable foreign keys for SQLite async
        if "sqlite" in settings.DATABASE_URL:
            await conn.execute(
                __import__("sqlalchemy").text("PRAGMA journal_mode=WAL")
            )
            await conn.execute(
                __import__("sqlalchemy").text("PRAGMA foreign_keys=ON")
            )
        await conn.run_sync(Base.metadata.create_all)

        # Add missing columns to existing SQLite tables (lightweight migration)
        if "sqlite" in settings.DATABASE_URL:
            await conn.run_sync(_migrate_add_user_contribution_columns)
            await conn.run_sync(_migrate_rename_special_ability_columns)
            await conn.run_sync(_migrate_add_character_creation_fields)
            await conn.run_sync(_migrate_add_species_extra_columns)
            await conn.run_sync(_migrate_add_active_buffs_column)
            await conn.run_sync(_migrate_add_languages_column)
            await conn.run_sync(_migrate_add_profession_equipment_columns)
            await conn.run_sync(_migrate_create_advantage_disadvantage_tables)
            await conn.run_sync(_migrate_add_improvement_cost_columns)
            await conn.run_sync(_migrate_create_cantrip_blessing_tables)
            await conn.run_sync(_migrate_add_enhancements_property_variants)
            await conn.run_sync(_migrate_add_character_variant_columns)
            await conn.run_sync(_migrate_add_source_book_to_adv_dis_sa)

        # Dialect-branched campaign rip migration (SQLite + Postgres). Handles
        # its own dialect check internally so it runs unconditionally.
        # Idempotent: no-op on fresh DBs and on already-migrated DBs.
        await conn.run_sync(_migrate_drop_campaign_tables)


def _migrate_add_character_variant_columns(connection):
    """Add species_variant and profession_variant columns to characters table."""
    from sqlalchemy import text

    result = connection.execute(text("PRAGMA table_info(characters)"))
    existing_cols = {row[1] for row in result.fetchall()}

    columns_to_add = [
        ("species_variant", "VARCHAR(128)"),
        ("profession_variant", "VARCHAR(128)"),
    ]

    for col_name, col_type in columns_to_add:
        if col_name not in existing_cols:
            connection.execute(
                text(f"ALTER TABLE characters ADD COLUMN {col_name} {col_type}")
            )


def _migrate_add_source_book_to_adv_dis_sa(connection):
    """Add source_book column to advantage, disadvantage, and special_ability templates."""
    from sqlalchemy import text

    for table in ["advantage_templates", "disadvantage_templates", "special_ability_templates"]:
        result = connection.execute(text(f"PRAGMA table_info({table})"))
        existing_cols = {row[1] for row in result.fetchall()}
        if not existing_cols:
            continue
        if "source_book" not in existing_cols:
            connection.execute(
                text(f"ALTER TABLE {table} ADD COLUMN source_book VARCHAR(64)")
            )


def _migrate_add_user_contribution_columns(connection):
    """Add created_by_user_id, created_by_username, is_custom to template tables.

    SQLite's create_all won't add columns to existing tables, so we use
    ALTER TABLE after checking PRAGMA table_info.
    """
    from sqlalchemy import text

    template_tables = [
        "creature_templates",
        "weapon_templates",
        "armor_templates",
        "shield_templates",
        "item_templates",
        "spell_templates",
        "liturgy_templates",
        "special_ability_templates",
        "talent_templates",
        "species_templates",
        "culture_templates",
        "profession_templates",
    ]

    columns_to_add = [
        ("created_by_user_id", "VARCHAR(36)"),
        ("created_by_username", "VARCHAR(128)"),
        ("is_custom", "BOOLEAN DEFAULT 0"),
    ]

    for table in template_tables:
        result = connection.execute(text(f"PRAGMA table_info({table})"))
        existing_cols = {row[1] for row in result.fetchall()}

        for col_name, col_type in columns_to_add:
            if col_name not in existing_cols:
                connection.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
                )


def _migrate_rename_special_ability_columns(connection):
    """Rename at_modifier→at_mod, pa_modifier→pa_mod in special_ability_templates.

    Aligns with the naming convention used by weapon_templates and shield_templates.
    SQLite >= 3.25 supports ALTER TABLE RENAME COLUMN.
    """
    from sqlalchemy import text

    result = connection.execute(text("PRAGMA table_info(special_ability_templates)"))
    existing_cols = {row[1] for row in result.fetchall()}

    renames = [("at_modifier", "at_mod"), ("pa_modifier", "pa_mod")]
    for old, new in renames:
        if old in existing_cols and new not in existing_cols:
            connection.execute(
                text(f"ALTER TABLE special_ability_templates RENAME COLUMN {old} TO {new}")
            )


def _migrate_add_character_creation_fields(connection):
    """Add creation_finalized and creation_ap_spent to characters table.

    SQLite's create_all won't add columns to existing tables, so we use
    ALTER TABLE after checking PRAGMA table_info.
    """
    from sqlalchemy import text

    result = connection.execute(text("PRAGMA table_info(characters)"))
    existing_cols = {row[1] for row in result.fetchall()}

    columns_to_add = [
        ("creation_finalized", "BOOLEAN DEFAULT 0"),
        ("creation_ap_spent", "INTEGER DEFAULT 0"),
    ]

    for col_name, col_type in columns_to_add:
        if col_name not in existing_cols:
            connection.execute(
                text(f"ALTER TABLE characters ADD COLUMN {col_name} {col_type}")
            )


def _migrate_add_species_extra_columns(connection):
    """Add lep_base, sk_base, zk_base, attribute_adjustments, common_cultures,
    auto_advantages columns to species_templates.
    """
    from sqlalchemy import text

    result = connection.execute(text("PRAGMA table_info(species_templates)"))
    existing_cols = {row[1] for row in result.fetchall()}

    if not existing_cols:
        return  # Table doesn't exist yet, create_all will handle it

    columns_to_add = [
        ("lep_base", "INTEGER DEFAULT 5"),
        ("sk_base", "INTEGER DEFAULT -5"),
        ("zk_base", "INTEGER DEFAULT -5"),
        ("attribute_adjustments", "TEXT"),
        ("common_cultures", "TEXT"),
        ("auto_advantages", "TEXT"),
        ("optolith_id", "VARCHAR(16)"),
    ]

    for col_name, col_type in columns_to_add:
        if col_name not in existing_cols:
            connection.execute(
                text(f"ALTER TABLE species_templates ADD COLUMN {col_name} {col_type}")
            )


def _migrate_add_active_buffs_column(connection):
    """Add active_buffs JSON column to characters table."""
    from sqlalchemy import text

    result = connection.execute(text("PRAGMA table_info(characters)"))
    existing_cols = {row[1] for row in result.fetchall()}

    if "active_buffs" not in existing_cols:
        connection.execute(
            text("ALTER TABLE characters ADD COLUMN active_buffs TEXT")
        )

    # Also add optolith_id and source_book to culture_templates and profession_templates
    for table in ["culture_templates", "profession_templates"]:
        result = connection.execute(text(f"PRAGMA table_info({table})"))
        table_cols = {row[1] for row in result.fetchall()}
        if not table_cols:
            continue
        extras = [("optolith_id", "VARCHAR(16)"), ("source_book", "VARCHAR(64)")]
        if table == "profession_templates":
            extras.append(("name_f", "VARCHAR(128)"))
        for col_name, col_type in extras:
            if col_name not in table_cols:
                connection.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
                )


def _migrate_add_languages_column(connection):
    """Add languages JSON column to characters table."""
    from sqlalchemy import text

    result = connection.execute(text("PRAGMA table_info(characters)"))
    existing_cols = {row[1] for row in result.fetchall()}

    if "languages" not in existing_cols:
        connection.execute(
            text("ALTER TABLE characters ADD COLUMN languages TEXT")
        )


def _migrate_add_profession_equipment_columns(connection):
    """Add starting_equipment and starting_money to profession_templates."""
    from sqlalchemy import text

    result = connection.execute(text("PRAGMA table_info(profession_templates)"))
    existing_cols = {row[1] for row in result.fetchall()}

    if "starting_equipment" not in existing_cols:
        connection.execute(
            text("ALTER TABLE profession_templates ADD COLUMN starting_equipment TEXT")
        )
    if "starting_money" not in existing_cols:
        connection.execute(
            text("ALTER TABLE profession_templates ADD COLUMN starting_money TEXT")
        )


def _migrate_create_advantage_disadvantage_tables(connection):
    """Create advantage_templates and disadvantage_templates tables if they don't exist."""
    from sqlalchemy import text, inspect

    inspector = inspect(connection)
    existing_tables = inspector.get_table_names()

    if "advantage_templates" not in existing_tables:
        connection.execute(text("""
            CREATE TABLE advantage_templates (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(128) NOT NULL,
                ap_cost INTEGER NOT NULL DEFAULT 0,
                category VARCHAR(32),
                levels INTEGER DEFAULT 1,
                prerequisites TEXT,
                description TEXT,
                rules_text TEXT,
                created_by_user_id VARCHAR(36),
                created_by_username VARCHAR(64),
                is_custom BOOLEAN DEFAULT 0
            )
        """))

    if "disadvantage_templates" not in existing_tables:
        connection.execute(text("""
            CREATE TABLE disadvantage_templates (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(128) NOT NULL,
                ap_cost INTEGER NOT NULL DEFAULT 0,
                category VARCHAR(32),
                levels INTEGER DEFAULT 1,
                prerequisites TEXT,
                description TEXT,
                rules_text TEXT,
                created_by_user_id VARCHAR(36),
                created_by_username VARCHAR(64),
                is_custom BOOLEAN DEFAULT 0
            )
        """))


def _migrate_create_cantrip_blessing_tables(connection):
    """Create cantrip_templates and blessing_templates tables if they don't exist."""
    from sqlalchemy import text, inspect as sa_inspect

    inspector = sa_inspect(connection)
    existing_tables = inspector.get_table_names()

    if "cantrip_templates" not in existing_tables:
        connection.execute(text("""
            CREATE TABLE cantrip_templates (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(128) NOT NULL,
                tradition TEXT,
                effect TEXT,
                range VARCHAR(64),
                duration VARCHAR(64),
                target VARCHAR(64),
                source_book VARCHAR(64),
                created_by_user_id VARCHAR(36),
                created_by_username VARCHAR(128),
                is_custom BOOLEAN DEFAULT 0
            )
        """))

    if "blessing_templates" not in existing_tables:
        connection.execute(text("""
            CREATE TABLE blessing_templates (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(128) NOT NULL,
                tradition TEXT,
                effect TEXT,
                range VARCHAR(64),
                duration VARCHAR(64),
                target VARCHAR(64),
                source_book VARCHAR(64),
                created_by_user_id VARCHAR(36),
                created_by_username VARCHAR(128),
                is_custom BOOLEAN DEFAULT 0
            )
        """))


def _migrate_add_enhancements_property_variants(connection):
    """Add enhancements/property to spells, enhancements to liturgies, variants to professions/species."""
    from sqlalchemy import text

    migrations = [
        ("spell_templates", "enhancements", "TEXT"),
        ("spell_templates", "property", "VARCHAR(64)"),
        ("liturgy_templates", "enhancements", "TEXT"),
        ("profession_templates", "variants", "TEXT"),
        ("species_templates", "variants", "TEXT"),
    ]

    for table, col_name, col_type in migrations:
        result = connection.execute(text(f"PRAGMA table_info({table})"))
        existing_cols = {row[1] for row in result.fetchall()}
        if col_name not in existing_cols:
            connection.execute(
                text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
            )


def _migrate_add_improvement_cost_columns(connection):
    """Add improvement_cost column to spell_templates and liturgy_templates."""
    from sqlalchemy import text

    for table in ["spell_templates", "liturgy_templates"]:
        result = connection.execute(text(f"PRAGMA table_info({table})"))
        existing_cols = {row[1] for row in result.fetchall()}

        if "improvement_cost" not in existing_cols:
            connection.execute(
                text(f"ALTER TABLE {table} ADD COLUMN improvement_cost VARCHAR(4)")
            )


def _migrate_drop_campaign_tables(connection):
    """Drop Campaign/Group/Quest/Lore/Timeline tables and FK columns.

    Two-phase, FK-safe, idempotent.

    Phase 1: drop campaign_id columns on game_sessions and inventory_items.
      SQLite: table-rebuild via SQLAlchemy reflection of post-rip models.
      Postgres: ALTER TABLE ... DROP COLUMN CASCADE.
    Phase 2: drop campaign tables in FK-child-first order.

    Safe on fresh DB (nothing to drop). Idempotent.
    """
    from sqlalchemy import text, inspect
    from models.session_state import GameSession
    from models.inventory import InventoryItem

    insp = inspect(connection)
    existing_tables = set(insp.get_table_names())
    dialect = connection.engine.dialect.name  # "sqlite" | "postgresql"

    # Phase 1: drop campaign_id columns
    if dialect == "sqlite":
        # defer_foreign_keys=ON works inside open transactions
        # (foreign_keys=OFF is a no-op inside an open transaction).
        connection.execute(text("PRAGMA defer_foreign_keys=ON"))

        for table_name, model_cls in [
            ("game_sessions", GameSession),
            ("inventory_items", InventoryItem),
        ]:
            if table_name not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table_name)}
            if "campaign_id" not in cols:
                continue
            _sqlite_table_rebuild_drop_col(connection, table_name, model_cls, "campaign_id")
    else:  # postgresql (and other dialects supporting ALTER DROP COLUMN)
        for table_name in ("game_sessions", "inventory_items"):
            if table_name not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table_name)}
            if "campaign_id" in cols:
                connection.execute(text(
                    f"ALTER TABLE {table_name} DROP COLUMN campaign_id CASCADE"
                ))

    # Phase 2: drop campaign tables in FK-child-first order
    drop_order = [
        "group_inventories", "campaign_players", "quests", "lore_entries",
        "timeline_events", "campaigns", "group_members", "groups",
    ]
    for tbl in drop_order:
        if tbl in existing_tables:
            connection.execute(text(f"DROP TABLE IF EXISTS {tbl}"))


def _sqlite_table_rebuild_drop_col(connection, old_table, model_cls, drop_col):
    """Rebuild a SQLite table without one column, using SQLAlchemy reflection
    of the current (post-rip) model's metadata to construct the new schema.

    Requires defer_foreign_keys=ON on the current transaction. Uses
    Table.to_metadata() against the model's existing MetaData (under a
    temporary name) so that cross-table ForeignKey references (e.g.
    game_sessions.gm_user_id -> users.id) resolve against the already-
    registered target tables. No SQL string surgery.
    """
    from sqlalchemy import text, inspect
    from sqlalchemy.schema import CreateTable, CreateIndex

    insp = inspect(connection)
    existing_cols = [c["name"] for c in insp.get_columns(old_table)]
    keep_cols = [c for c in existing_cols if c != drop_col]
    col_list_sql = ", ".join(keep_cols)

    tmp_name = f"{old_table}__rebuild"
    source_metadata = model_cls.__table__.metadata

    # If a prior failed run left the temp table behind in the DB, drop it so
    # CreateTable doesn't collide.
    connection.execute(text(f"DROP TABLE IF EXISTS {tmp_name}"))

    # Pop any stale Table object from the MetaData registry before re-copying.
    if tmp_name in source_metadata.tables:
        source_metadata.remove(source_metadata.tables[tmp_name])

    try:
        tmp_table = model_cls.__table__.to_metadata(source_metadata, name=tmp_name)

        connection.execute(CreateTable(tmp_table))
        connection.execute(text(
            f"INSERT INTO {tmp_name} ({col_list_sql}) SELECT {col_list_sql} FROM {old_table}"
        ))
        connection.execute(text(f"DROP TABLE {old_table}"))
        connection.execute(text(f"ALTER TABLE {tmp_name} RENAME TO {old_table}"))
    finally:
        # Remove the temp Table object from MetaData so later create_all /
        # migrations don't see a phantom table under the temp name.
        if tmp_name in source_metadata.tables:
            source_metadata.remove(source_metadata.tables[tmp_name])

    # Recreate indexes declared on the original model (now resolved against
    # the renamed table by name). Swallow "already exists" on retries.
    from sqlalchemy.exc import OperationalError
    for idx in model_cls.__table__.indexes:
        try:
            connection.execute(CreateIndex(idx))
        except OperationalError as e:
            if "already exists" not in str(e).lower():
                raise
