"""Alembic environment.

Two key wiring choices in this file:

  1. The SQLAlchemy URL comes from `app.core.config.settings.database_url`
     — NOT from `alembic.ini`. That way Alembic uses exactly the same
     DSN as the running app, and `alembic.ini`'s placeholder is ignored.

  2. `target_metadata` points at `app.core.db.Base.metadata`, so
     `alembic revision --autogenerate` detects every ORM model that's
     subclassed `Base` (including future feature models that haven't
     been written yet).
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.core.config import settings
from app.core.db import Base

# Alembic Config object (parses alembic.ini).
config = context.config

# Override the URL from settings — this is the single source of truth.
config.set_main_option("sqlalchemy.url", settings.database_url)

# Logging config from alembic.ini.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate looks here. Importing model modules registers their
# tables with Base.metadata; future feature/model.py files get imported
# at the bottom of this file to ensure they're seen.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """'Offline' mode — emits SQL to stdout instead of executing.

    Useful for generating SQL bundles to apply via psql or Supabase CLI.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """'Online' mode — opens a real async connection and runs migrations.

    Uses NullPool because the migrator is short-lived; we don't want a
    pool of stale connections after `alembic upgrade head` returns.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
