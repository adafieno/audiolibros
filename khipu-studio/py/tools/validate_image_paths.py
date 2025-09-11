#!/usr/bin/env python3
"""
Image Path Validation Tool

This tool validates that book cover image paths are consistent between:
1. The metadata configuration (project.khipu.json or book.meta.json)
2. The actual file system location
3. The application's image loading logic

It simulates the same path resolution logic used by both:
- ImageSelector component (for editing)  
- ProjectCover component (for thumbnails in Home.tsx)
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, List

def simulate_khipu_image_loading(project_root: Path, cover_image_path: str) -> Dict[str, Any]:
    """
    Simulate the exact logic used by window.khipu.call("file:getImageDataUrl")
    which is used by both ImageSelector and ProjectCover components.
    """
    
    # This mimics main.cjs: path.join(projectRoot, fileName)
    full_image_path = project_root / cover_image_path
    
    result = {
        'configured_path': cover_image_path,
        'resolved_path': str(full_image_path),
        'file_exists': full_image_path.exists(),
        'success': False,
        'error': None
    }
    
    if full_image_path.exists():
        try:
            # Check if it's actually an image file
            with open(full_image_path, 'rb') as f:
                header = f.read(8)
            
            # Simple JPEG header check
            if header.startswith(b'\xff\xd8\xff'):
                result['success'] = True
                result['file_type'] = 'JPEG'
                result['file_size'] = full_image_path.stat().st_size
            else:
                result['error'] = 'File exists but is not a valid JPEG'
                
        except Exception as e:
            result['error'] = f'Failed to read file: {e}'
    else:
        result['error'] = 'File does not exist'
    
    return result

def simulate_fallback_loading(project_root: Path) -> List[Dict[str, Any]]:
    """
    Simulate the fallback logic used by ProjectCover component.
    This is what saves projects when the main cover path is wrong.
    """
    
    # From Home.tsx ProjectCover component
    fallback_files = ['art/cover_3000.jpg', 'art/cover.jpg', 'art/cover.png']
    
    results = []
    for fallback_path in fallback_files:
        result = simulate_khipu_image_loading(project_root, fallback_path)
        result['is_fallback'] = True
        results.append(result)
    
    return results

def analyze_project_cover_loading(project_path: Path) -> Dict[str, Any]:
    """Complete analysis of how cover image loading works for a project."""
    
    analysis = {
        'project_path': str(project_path),
        'validation': {}
    }
    
    # Load project configuration
    project_file = project_path / 'project.khipu.json'
    book_meta_file = project_path / 'book.meta.json'
    
    project_data = None
    book_meta_data = None
    
    if project_file.exists():
        try:
            project_data = json.loads(project_file.read_text(encoding='utf-8'))
            analysis['project_config_loaded'] = True
        except Exception as e:
            analysis['project_config_error'] = str(e)
    
    if book_meta_file.exists():
        try:
            book_meta_data = json.loads(book_meta_file.read_text(encoding='utf-8'))
            analysis['book_meta_loaded'] = True
        except Exception as e:
            analysis['book_meta_error'] = str(e)
    
    # Find cover image configuration
    cover_image_path = None
    cover_source = None
    
    if project_data and 'bookMeta' in project_data and 'coverImage' in project_data['bookMeta']:
        cover_image_path = project_data['bookMeta']['coverImage']
        cover_source = 'project.khipu.json (bookMeta)'
    elif book_meta_data and 'coverImage' in book_meta_data:
        cover_image_path = book_meta_data['coverImage']
        cover_source = 'book.meta.json'
    
    analysis['cover_config'] = {
        'path': cover_image_path,
        'source': cover_source
    }
    
    # Test main cover image loading (ImageSelector + ProjectCover primary path)
    if cover_image_path:
        main_result = simulate_khipu_image_loading(project_path, cover_image_path)
        analysis['main_cover_test'] = main_result
    
    # Test fallback loading (ProjectCover fallback system)
    fallback_results = simulate_fallback_loading(project_path)
    analysis['fallback_tests'] = fallback_results
    
    # Find working fallback
    working_fallback = next((r for r in fallback_results if r['success']), None)
    analysis['working_fallback'] = working_fallback
    
    # Overall assessment
    main_works = cover_image_path and analysis.get('main_cover_test', {}).get('success', False)
    fallback_works = working_fallback is not None
    
    analysis['assessment'] = {
        'configured_path_works': main_works,
        'fallback_available': fallback_works,
        'thumbnail_will_load': main_works or fallback_works,
        'needs_path_fix': not main_works and fallback_works
    }
    
    return analysis

def print_analysis_report(analysis: Dict[str, Any]):
    """Print a human-readable analysis report."""
    
    print(f"🔍 Cover Image Loading Analysis")
    print(f"Project: {analysis['project_path']}")
    print()
    
    # Configuration Status
    cover_config = analysis.get('cover_config', {})
    print(f"📋 Configuration:")
    if cover_config.get('path'):
        print(f"   Cover Path: {cover_config['path']}")
        print(f"   Source: {cover_config['source']}")
    else:
        print(f"   ❌ No cover image configured")
    print()
    
    # Main Path Test
    if 'main_cover_test' in analysis:
        main_test = analysis['main_cover_test']
        print(f"🎯 Main Path Test:")
        print(f"   Configured: {main_test['configured_path']}")
        print(f"   Resolved: {main_test['resolved_path']}")
        status_msg = "✅ Success" if main_test['success'] else f"❌ {main_test.get('error', 'Failed')}"
        print(f"   Status: {status_msg}")
        if main_test.get('file_size'):
            print(f"   File Size: {main_test['file_size']} bytes")
        print()
    
    # Fallback Tests
    print(f"🔄 Fallback System Tests:")
    fallback_tests = analysis.get('fallback_tests', [])
    for i, test in enumerate(fallback_tests):
        status = '✅' if test['success'] else '❌'
        print(f"   {i+1}. {test['configured_path']}: {status}")
        if test['success']:
            print(f"      Size: {test.get('file_size', 'unknown')} bytes")
    print()
    
    # Assessment
    assessment = analysis.get('assessment', {})
    print(f"📊 Assessment:")
    print(f"   Main path works: {'✅' if assessment.get('configured_path_works') else '❌'}")
    print(f"   Fallback available: {'✅' if assessment.get('fallback_available') else '❌'}")
    print(f"   Thumbnail will load: {'✅' if assessment.get('thumbnail_will_load') else '❌'}")
    print(f"   Needs path fix: {'⚠️ Yes' if assessment.get('needs_path_fix') else '✅ No'}")
    print()
    
    # Explanation
    if assessment.get('needs_path_fix'):
        working = analysis.get('working_fallback', {})
        if working:
            print(f"💡 Recommendation:")
            print(f"   Update cover image path from:")
            print(f"   '{cover_config.get('path')}' → '{working['configured_path']}'")
            print()
    
    print(f"🔧 Technical Details:")
    print(f"   This analysis simulates the exact same logic used by:")
    print(f"   • ImageSelector component (Book page editing)")
    print(f"   • ProjectCover component (Home page thumbnails)")
    print(f"   • Both use: window.khipu.call('file:getImageDataUrl')")
    print(f"   • Which resolves to: path.join(projectRoot, fileName)")

def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python validate_image_paths.py <project_path>")
        sys.exit(1)
    
    project_path = Path(sys.argv[1])
    
    if not project_path.exists():
        print(f"❌ Project path does not exist: {project_path}")
        sys.exit(1)
    
    analysis = analyze_project_cover_loading(project_path)
    print_analysis_report(analysis)

if __name__ == "__main__":
    main()
