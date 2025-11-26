# Alembic Database Migrations Guide

This project uses [Alembic](https://alembic.sqlalchemy.org/) for database schema versioning and migrations.

## Setup

Alembic is already configured and initialized. The configuration files are:
- `alembic.ini` - Alembic configuration file with database connection string
- `alembic/env.py` - Migration environment (configured for async SQLAlchemy)
- `alembic/versions/` - Directory containing migration scripts

## Common Commands

### Check Current Migration Status
```bash
alembic current
```

### Create a New Migration (Auto-generate)
When you modify your SQLAlchemy models, create a new migration:
```bash
alembic revision --autogenerate -m "Description of changes"
```

This will:
1. Compare your models in `shared/models/` with the current database schema
2. Generate a migration script in `alembic/versions/`
3. Include both `upgrade()` and `downgrade()` functions

**Always review the generated migration** before applying it!

### Apply Migrations (Upgrade)
Apply all pending migrations:
```bash
alembic upgrade head
```

Apply to a specific revision:
```bash
alembic upgrade <revision_id>
```

Apply one migration at a time:
```bash
alembic upgrade +1
```

### Rollback Migrations (Downgrade)
Rollback all migrations:
```bash
alembic downgrade base
```

Rollback to a specific revision:
```bash
alembic downgrade <revision_id>
```

Rollback one migration:
```bash
alembic downgrade -1
```

### View Migration History
```bash
alembic history --verbose
```

### Show Current Revision
```bash
alembic current
```

## Workflow

### Adding a New Feature

1. **Modify your models** in `shared/models/`
   ```python
   # Example: Add a new column to User model
   class User(Base):
       # ... existing fields ...
       phone_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
   ```

2. **Create migration**
   ```bash
   alembic revision --autogenerate -m "Add phone_number to users"
   ```

3. **Review the generated migration** in `alembic/versions/`
   - Check that all changes are captured correctly
   - Add any custom data migrations if needed
   - Verify the downgrade function

4. **Test the migration**
   ```bash
   # Apply migration
   alembic upgrade head
   
   # Test your changes
   # ...
   
   # If something is wrong, rollback
   alembic downgrade -1
   ```

5. **Commit the migration file**
   ```bash
   git add alembic/versions/<new_migration_file>.py
   git commit -m "Add phone_number field to users"
   ```

## Initial Migration

The initial migration `e8a14672d2af` creates all base tables:
- `tenants` - Multi-tenant organization data
- `users` - User accounts with authentication
- `projects` - Audiobook projects
- `project_members` - Project team assignments

## Important Notes

### Database Connection

The database URL is configured in `alembic.ini`:
```ini
sqlalchemy.url = postgresql+asyncpg://khipu:khipu_dev_password@localhost:5432/khipu_dev
```

For production, update this URL or use environment variables.

### Async Support

This project uses async SQLAlchemy. The `alembic/env.py` file is configured to use:
- `asyncio.run()` for async operations
- `async_engine_from_config()` for database connection
- Proper async context managers

### Auto-creation Disabled

The automatic table creation (`Base.metadata.create_all()`) has been removed from `main.py`. 
All schema changes must now go through Alembic migrations.

### Model Imports

All models are imported in `alembic/env.py` to enable autogenerate:
```python
from shared.models import Tenant, User, Project, ProjectMember
target_metadata = Base.metadata
```

If you add new models, make sure they are imported in `shared/models/__init__.py`.

## Troubleshooting

### Migration Empty (pass statements)

If `alembic revision --autogenerate` creates an empty migration, possible causes:
1. No changes to models since last migration
2. Database already has the tables (drop and recreate with migrations)
3. Models not imported in `alembic/env.py`

### DuplicateTableError

If you see "relation already exists":
1. Stop the API (it shouldn't auto-create tables anymore)
2. Drop existing tables: 
   ```bash
   docker exec khipu-postgres psql -U khipu -d khipu_dev -c "DROP TABLE IF EXISTS alembic_version, project_members, projects, users, tenants CASCADE;"
   ```
3. Run migrations: `alembic upgrade head`

### Can't Connect to Database

Check that:
1. PostgreSQL container is running: `docker ps | grep khipu-postgres`
2. Database exists: `docker exec khipu-postgres psql -U khipu -l`
3. Connection string in `alembic.ini` is correct

## Best Practices

1. **Always review auto-generated migrations** - Alembic is smart but not perfect
2. **Test migrations** both up and down before committing
3. **One logical change per migration** - Don't combine unrelated changes
4. **Write meaningful migration messages** - Help your future self
5. **Never edit applied migrations** - Create a new migration to fix issues
6. **Commit migrations with code changes** - Keep them in sync
7. **Include data migrations when needed** - Schema + data together
8. **Test on a copy of production data** before deploying

## Resources

- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [Alembic Auto Generate](https://alembic.sqlalchemy.org/en/latest/autogenerate.html)
- [SQLAlchemy Async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
