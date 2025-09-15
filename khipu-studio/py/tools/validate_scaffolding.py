#!/usr/bin/env python3
"""
Project Scaffolding Validation Tool

Tests that the updated project creation scaffolding generates projects with the optimized metadata structure.

Usage:
    python validate_scaffolding.py <test_project_path>
    
This tool validates that new projects have:
1. Optimized project.khipu.json with comprehensive path tracking
2. Clean book.meta.json template ready for metadata
3. Art directory with README
4. Proper directory structure
5. Consistent with migration tool expectations
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, List

def validate_project_structure(project_path: Path) -> Dict[str, Any]:
    """Validate the complete project structure created by scaffolding."""
    
    validation = {
        'project_path': str(project_path),
        'structure_checks': {},
        'file_checks': {},
        'content_checks': {},
        'optimization_checks': {},
        'overall_score': 0,
        'max_score': 0
    }
    
    # Required directories
    required_dirs = [
        'analysis/chapters_txt',
        'art',
        'dossier', 
        'ssml/plans',
        'ssml/xml',
        'cache/tts',
        'audio/chapters', 
        'audio/book',
        'exports'
    ]
    
    validation['max_score'] += len(required_dirs)
    
    for dir_name in required_dirs:
        dir_path = project_path / dir_name
        exists = dir_path.exists() and dir_path.is_dir()
        validation['structure_checks'][dir_name] = exists
        if exists:
            validation['overall_score'] += 1
    
    # Required files
    required_files = [
        'project.khipu.json',
        'book.meta.json',
        'production.settings.json',
        'art/README.md',
        'analysis/chapters_txt/ch01.txt'
    ]
    
    validation['max_score'] += len(required_files)
    
    for file_name in required_files:
        file_path = project_path / file_name
        exists = file_path.exists() and file_path.is_file()
        validation['file_checks'][file_name] = exists
        if exists:
            validation['overall_score'] += 1
    
    # Content validation
    validation['max_score'] += 8  # 8 content checks
    
    # 1. project.khipu.json structure
    project_file = project_path / 'project.khipu.json'
    if project_file.exists():
        try:
            project_data = json.loads(project_file.read_text(encoding='utf-8'))
            
            # Check for comprehensive paths section
            has_paths = 'paths' in project_data
            comprehensive_paths = has_paths and len(project_data.get('paths', {})) >= 8
            validation['content_checks']['project_has_paths_section'] = has_paths
            validation['content_checks']['project_has_comprehensive_paths'] = comprehensive_paths
            if has_paths:
                validation['overall_score'] += 1
            if comprehensive_paths:
                validation['overall_score'] += 1
            
            # Check for workflow tracking
            has_workflow = 'workflow' in project_data
            validation['content_checks']['project_has_workflow_tracking'] = has_workflow
            if has_workflow:
                validation['overall_score'] += 1
            
            # Check that bookMeta is NOT in project config (should be separate now)
            no_book_meta = 'bookMeta' not in project_data
            validation['content_checks']['project_no_book_meta_duplication'] = no_book_meta
            if no_book_meta:
                validation['overall_score'] += 1
                
        except Exception as e:
            validation['content_checks']['project_json_parse_error'] = str(e)
    
    # 2. book.meta.json structure
    book_file = project_path / 'book.meta.json'
    if book_file.exists():
        try:
            book_data = json.loads(book_file.read_text(encoding='utf-8'))
            
            # Check for required book fields
            required_book_fields = ['title', 'authors', 'language', 'description']
            has_book_fields = all(field in book_data for field in required_book_fields)
            validation['content_checks']['book_meta_has_required_fields'] = has_book_fields
            if has_book_fields:
                validation['overall_score'] += 1
                
            # Check that it's a clean template (empty but valid)
            is_template = book_data.get('title') == '' and len(book_data.get('authors', [])) == 0
            validation['content_checks']['book_meta_is_clean_template'] = is_template
            if is_template:
                validation['overall_score'] += 1
                
        except Exception as e:
            validation['content_checks']['book_json_parse_error'] = str(e)
    
    # 3. Art directory README
    art_readme = project_path / 'art/README.md'
    if art_readme.exists():
        try:
            readme_content = art_readme.read_text(encoding='utf-8')
            has_cover_instructions = 'cover' in readme_content.lower() and '3000' in readme_content
            validation['content_checks']['art_readme_has_cover_instructions'] = has_cover_instructions
            if has_cover_instructions:
                validation['overall_score'] += 1
        except Exception as e:
            validation['content_checks']['art_readme_error'] = str(e)
    
    # 4. Sample chapter content  
    sample_chapter = project_path / 'analysis/chapters_txt/ch01.txt'
    if sample_chapter.exists():
        try:
            chapter_content = sample_chapter.read_text(encoding='utf-8')
            has_sample_text = len(chapter_content.strip()) > 0
            validation['content_checks']['sample_chapter_has_content'] = has_sample_text
            if has_sample_text:
                validation['overall_score'] += 1
        except Exception as e:
            validation['content_checks']['sample_chapter_error'] = str(e)
    
    # Optimization checks (compatibility with migration tool)
    validation['max_score'] += 3
    
    # Check if structure matches migration tool expectations
    if project_file.exists():
        try:
            project_data = json.loads(project_file.read_text(encoding='utf-8'))
            paths = project_data.get('paths', {})
            
            # Should have art path for covers
            has_art_path = 'art' in paths
            validation['optimization_checks']['has_art_path_tracking'] = has_art_path
            if has_art_path:
                validation['overall_score'] += 1
            
            # Should have all major paths tracked
            expected_paths = ['bookMeta', 'manuscript', 'audio', 'exports']
            has_major_paths = all(p in paths for p in expected_paths)
            validation['optimization_checks']['has_major_path_tracking'] = has_major_paths
            if has_major_paths:
                validation['overall_score'] += 1
            
            # Should be compatible with validation tools
            version_ok = project_data.get('version') == 1
            validation['optimization_checks']['compatible_version'] = version_ok
            if version_ok:
                validation['overall_score'] += 1
                
        except Exception as e:
            validation['optimization_checks']['project_analysis_error'] = str(e)
    
    # Calculate percentage score
    if validation['max_score'] > 0:
        validation['score_percentage'] = (validation['overall_score'] / validation['max_score']) * 100
    else:
        validation['score_percentage'] = 0
    
    return validation

def print_validation_report(validation: Dict[str, Any]):
    """Print a comprehensive validation report."""
    
    print(f"🏗️ Project Scaffolding Validation Report")
    print(f"Project: {validation['project_path']}")
    print(f"Overall Score: {validation['overall_score']}/{validation['max_score']} ({validation['score_percentage']:.1f}%)")
    print()
    
    # Structure checks
    print(f"📁 Directory Structure:")
    structure = validation.get('structure_checks', {})
    for dir_name, exists in structure.items():
        status = '✅' if exists else '❌'
        print(f"   {status} {dir_name}")
    print()
    
    # File checks
    print(f"📄 Required Files:")
    files = validation.get('file_checks', {})
    for file_name, exists in files.items():
        status = '✅' if exists else '❌'
        print(f"   {status} {file_name}")
    print()
    
    # Content validation
    print(f"📋 Content Validation:")
    content = validation.get('content_checks', {})
    for check_name, result in content.items():
        if isinstance(result, bool):
            status = '✅' if result else '❌'
            readable_name = check_name.replace('_', ' ').title()
            print(f"   {status} {readable_name}")
        elif isinstance(result, str):
            print(f"   ❌ {check_name}: {result}")
    print()
    
    # Optimization checks
    print(f"⚡ Optimization & Compatibility:")
    optimization = validation.get('optimization_checks', {})
    for check_name, result in optimization.items():
        if isinstance(result, bool):
            status = '✅' if result else '❌'
            readable_name = check_name.replace('_', ' ').title()
            print(f"   {status} {readable_name}")
        elif isinstance(result, str):
            print(f"   ❌ {check_name}: {result}")
    print()
    
    # Summary
    score = validation['score_percentage']
    if score >= 95:
        print(f"🎉 Excellent! Scaffolding creates optimally structured projects.")
    elif score >= 85:
        print(f"✅ Good! Minor improvements could be made.")
    elif score >= 70:
        print(f"⚠️ Acceptable but needs some fixes.")
    else:
        print(f"❌ Scaffolding needs significant improvements.")
    
    print()
    print(f"🔧 Technical Notes:")
    print(f"   • This validation matches migration tool expectations")
    print(f"   • New projects should be compatible with existing tools")
    print(f"   • Structure follows optimized metadata organization")

def main():
    import sys
    
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    project_path = Path(sys.argv[1])
    
    if not project_path.exists():
        print(f"❌ Project path does not exist: {project_path}")
        sys.exit(1)
    
    validation = validate_project_structure(project_path)
    print_validation_report(validation)
    
    # Exit with error code if score is too low
    if validation['score_percentage'] < 80:
        sys.exit(1)

if __name__ == "__main__":
    main()
