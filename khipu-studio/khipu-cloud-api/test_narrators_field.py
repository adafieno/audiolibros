"""Test script to check narrators field persistence in database."""
import asyncio
import sys
from pathlib import Path

# Add the project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text
from shared.database import async_session_maker


async def check_narrators():
    """Check if narrators field is being persisted."""
    async with async_session_maker() as session:
        # Get a project
        result = await session.execute(
            text('SELECT id, title, narrators, authors FROM projects LIMIT 1')
        )
        row = result.first()
        
        if row:
            print(f'Project ID: {row[0]}')
            print(f'Title: {row[1]}')
            print(f'Narrators: {row[2]}')
            print(f'Authors: {row[3]}')
            print(f'\nNarrators type: {type(row[2])}')
            print(f'Authors type: {type(row[3])}')
        else:
            print('No projects found in database')


if __name__ == '__main__':
    asyncio.run(check_narrators())
