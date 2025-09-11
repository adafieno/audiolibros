#!/usr/bin/env python3
"""
Metadata Structure Migration Tool

Fixes path inconsistencies and optimizes project metadata organization by:
1. Moving book metadata from project.khipu.json to book.meta.json
2. Adding comprehensive path tracking to project.khipu.json
3. Fixing cover image path references
4. Ensuring consistent file structure

Usage:
    python migrate_metadata.py <project_path>
    
Example:
    python migrate_metadata.py C:\code\audiolibros\khipu-studio\reference-code\test_7
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

def validate_project_structure(project_path: Path) -> Dict[str, bool]:
    """Validate that the project has the expected structure."""
    validation = {
        'project_khipu_exists': (project_path / 'project.khipu.json').exists(),
        'book_meta_exists': (project_path / 'book.meta.json').exists(),
        'art_directory': (project_path / 'art').exists(),
        'analysis_directory': (project_path / 'analysis').exists()
    }
    return validation

def find_cover_image(project_path: Path) -> Optional[str]:
    """Find the actual cover image file and return its relative path."""
    potential_covers = [
        'art/cover_3000.jpg',
        'art/cover.jpg', 
        'art/cover.png',
        'cover_3000.jpg',
        'cover.jpg',
        'cover.png'
    ]
    
    for cover_path in potential_covers:
        if (project_path / cover_path).exists():
            return cover_path
    return None

def backup_file(file_path: Path) -> Path:
    """Create a backup of the file with timestamp."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = file_path.with_suffix(f'.backup_{timestamp}{file_path.suffix}')
    backup_path.write_text(file_path.read_text(encoding='utf-8'), encoding='utf-8')
    print(f"✅ Backup created: {backup_path.name}")
    return backup_path

def create_optimized_project_config(project_data: Dict[str, Any], cover_image_path: Optional[str]) -> Dict[str, Any]:
    """Create optimized project.khipu.json with comprehensive path tracking."""
    
    # Remove book metadata from project config
    optimized = {k: v for k, v in project_data.items() if k != 'bookMeta'}
    
    # Add comprehensive paths section
    paths = {
        "bookMeta": "book.meta.json",
        "production": "production.settings.json",
        "manuscript": "analysis/chapters_txt",
        "dossier": "dossier",
        "ssml": "ssml/plans", 
        "audio": "audio",
        "cache": "cache",
        "exports": "exports"
    }
    
    # Add cover path if found
    if cover_image_path:
        paths["cover"] = cover_image_path
        
    optimized["paths"] = paths
    
    return optimized

def create_complete_book_meta(project_data: Dict[str, Any], cover_image_path: Optional[str]) -> Dict[str, Any]:
    """Create complete book.meta.json with all book information."""
    
    # Start with existing bookMeta from project.khipu.json
    book_meta = project_data.get('bookMeta', {})
    
    # Ensure all required fields exist with proper defaults
    complete_meta = {
        "title": book_meta.get("title", ""),
        "subtitle": book_meta.get("subtitle", ""),
        "authors": book_meta.get("authors", []),
        "narrators": book_meta.get("narrators", []),
        "language": book_meta.get("language", "es-PE"),
        "description": book_meta.get("description", ""),
        "keywords": book_meta.get("keywords", []),
        "categories": book_meta.get("categories", []),
        "publisher": book_meta.get("publisher", ""),
        "publication_date": book_meta.get("publication_date", ""),
        "rights": book_meta.get("rights", ""),
        "series": book_meta.get("series", {"name": "", "number": None}),
        "sku": book_meta.get("sku", ""),
        "isbn": book_meta.get("isbn", ""),
        "disclosure_digital_voice": book_meta.get("disclosure_digital_voice", False)
    }
    
    # Add corrected cover image path
    if cover_image_path:
        complete_meta["coverImage"] = cover_image_path
    
    return complete_meta

def migrate_project_metadata(project_path: Path, dry_run: bool = False) -> bool:
    """Perform the complete metadata migration."""
    
    print(f"🔄 Migrating project metadata: {project_path}")
    print(f"   Mode: {'DRY RUN' if dry_run else 'LIVE MIGRATION'}")
    
    # Validate project structure
    validation = validate_project_structure(project_path)
    print(f"\n📋 Project Validation:")
    for check, status in validation.items():
        print(f"   {check}: {'✅' if status else '❌'}")
    
    if not validation['project_khipu_exists']:
        print("❌ project.khipu.json not found!")
        return False
    
    # Load existing project.khipu.json
    project_file = project_path / 'project.khipu.json'
    try:
        project_data = json.loads(project_file.read_text(encoding='utf-8'))
        print(f"✅ Loaded project.khipu.json")
    except Exception as e:
        print(f"❌ Failed to load project.khipu.json: {e}")
        return False
    
    # Find actual cover image
    cover_image_path = find_cover_image(project_path)
    current_cover = project_data.get('bookMeta', {}).get('coverImage')
    
    print(f"\n🖼️ Cover Image Analysis:")
    print(f"   Current path in config: {current_cover or 'None'}")
    print(f"   Actual file found: {cover_image_path or 'None'}")
    
    if current_cover != cover_image_path:
        print(f"   ⚠️ Path mismatch detected!")
        if cover_image_path:
            print(f"   ✅ Will fix to: {cover_image_path}")
        else:
            print(f"   ❌ No cover image file found")
    
    # Create optimized configurations
    optimized_project = create_optimized_project_config(project_data, cover_image_path)
    complete_book_meta = create_complete_book_meta(project_data, cover_image_path)
    
    print(f"\n📊 Migration Summary:")
    print(f"   Book metadata fields: {len(complete_book_meta)}")
    print(f"   Path tracking entries: {len(optimized_project.get('paths', {}))}")
    print(f"   Cover image: {'Fixed' if cover_image_path else 'Not found'}")
    
    if dry_run:
        print(f"\n🔍 DRY RUN - No files will be modified")
        return True
    
    # Perform actual migration
    print(f"\n💾 Applying Migration:")
    
    try:
        # Create backups
        backup_file(project_file)
        
        book_meta_file = project_path / 'book.meta.json'
        if book_meta_file.exists():
            backup_file(book_meta_file)
        
        # Write optimized project.khipu.json
        project_file.write_text(
            json.dumps(optimized_project, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )
        print(f"✅ Updated project.khipu.json")
        
        # Write complete book.meta.json
        book_meta_file.write_text(
            json.dumps(complete_book_meta, indent=2, ensure_ascii=False), 
            encoding='utf-8'
        )
        print(f"✅ Updated book.meta.json")
        
        print(f"\n🎉 Migration completed successfully!")
        print(f"   ✅ Metadata structure optimized")
        print(f"   ✅ Path tracking added")
        print(f"   ✅ Cover image path {'fixed' if cover_image_path else 'cleared'}")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    project_path = Path(sys.argv[1])
    dry_run = '--dry-run' in sys.argv
    
    if not project_path.exists():
        print(f"❌ Project path does not exist: {project_path}")
        sys.exit(1)
    
    if not project_path.is_dir():
        print(f"❌ Project path is not a directory: {project_path}")
        sys.exit(1)
    
    success = migrate_project_metadata(project_path, dry_run=dry_run)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
