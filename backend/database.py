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
