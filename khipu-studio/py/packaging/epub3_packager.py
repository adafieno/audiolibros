#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EPUB3 Packager for Kobo

Creates EPUB3 audiobook packages with Media Overlays for Kobo.

Format specifications:
- Kobo: EPUB3 with MP3 audio + SMIL synchronization, 192kbps, 44.1kHz, mono/stereo
"""

from __future__ import annotations
from pathlib import Path
from typing import Dict, Any, List, Optional
import subprocess
import json
import zipfile
import shutil
import tempfile
from datetime import datetime
import uuid
import re


def _sanitize_filename(name: str) -> str:
    """Sanitize string for use as filename."""
    # Remove or replace invalid characters
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    # Replace spaces with underscores
    name = name.replace(' ', '_')
    # Limit length
    if len(name) > 200:
        name = name[:200]
    return name or 'Untitled'


def _get_audio_duration(audio_path: Path) -> float:
    """Get audio duration in seconds using ffprobe."""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(audio_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', check=True)
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _convert_to_mp3(
    input_path: Path,
    output_path: Path,
    bitrate: str,
    sample_rate: int,
    channels: int
) -> bool:
    """Convert audio file to MP3 with specified settings."""
    try:
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-codec:a', 'libmp3lame',
            '-b:a', bitrate,
            '-ar', str(sample_rate),
            '-ac', str(channels),
            '-y',  # Overwrite output file
            str(output_path)
        ]
        
        subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', check=True)
        return output_path.exists()
    except subprocess.CalledProcessError as e:
        print("[ERROR] FFmpeg conversion failed:")
        print(f"  Command: {' '.join(cmd)}")
        print(f"  Exit code: {e.returncode}")
        if e.stderr:
            print(f"  Error output: {e.stderr}")
        return False
    except Exception as e:
        print(f"[ERROR] Conversion failed: {e}")
        print(f"  Command: {' '.join(cmd)}")
        return False


def _create_mimetype_file(temp_dir: Path):
    """Create mimetype file (must be first, uncompressed)."""
    mimetype_path = temp_dir / 'mimetype'
    mimetype_path.write_text('application/epub+zip', encoding='utf-8')


def _create_container_xml(temp_dir: Path):
    """Create META-INF/container.xml file."""
    meta_inf = temp_dir / 'META-INF'
    meta_inf.mkdir(exist_ok=True)
    
    container_xml = meta_inf / 'container.xml'
    content = '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
'''
    container_xml.write_text(content, encoding='utf-8')


def _create_package_opf(
    temp_dir: Path,
    book_meta: Dict[str, Any],
    chapters: List[Dict[str, Any]],
    audio_files: List[str]
):
    """Create OEBPS/package.opf file."""
    oebps = temp_dir / 'OEBPS'
    oebps.mkdir(exist_ok=True)
    
    # Generate UUID for the book
    book_id = str(uuid.uuid4())
    
    # Get metadata
    title = book_meta.get('title', 'Untitled')
    authors = book_meta.get('authors', [])
    narrators = book_meta.get('narrators', [])
    language = book_meta.get('language', 'en')
    publisher = book_meta.get('publisher', '')
    description = book_meta.get('description', '')
    
    # Start building OPF
    opf_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="book-id">urn:uuid:{book_id}</dc:identifier>
    <dc:title>{title}</dc:title>
'''
    
    # Add authors
    for author in authors:
        opf_content += f'    <dc:creator>{author}</dc:creator>\n'
    
    # Add narrators
    for narrator in narrators:
        opf_content += f'    <dc:contributor opf:role="nrt">{narrator}</dc:contributor>\n'
    
    opf_content += f'''    <dc:language>{language}</dc:language>
    <dc:publisher>{publisher}</dc:publisher>
    <dc:description>{description}</dc:description>
    <meta property="dcterms:modified">{datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}</meta>
    <meta property="media:duration">0</meta>
    <meta property="media:narrator">{', '.join(narrators)}</meta>
  </metadata>
  <manifest>
    <item id="toc" properties="nav" href="toc.xhtml" media-type="application/xhtml+xml"/>
'''
    
    # Add audio files to manifest
    for i, audio_file in enumerate(audio_files, 1):
        opf_content += f'    <item id="audio{i:03d}" href="audio/{audio_file}" media-type="audio/mpeg"/>\n'
    
    # Add SMIL files to manifest
    for i, chapter in enumerate(chapters, 1):
        opf_content += f'    <item id="smil{i:03d}" href="smil/chapter{i:03d}.smil" media-type="application/smil+xml"/>\n'
        opf_content += f'    <item id="chapter{i:03d}" href="text/chapter{i:03d}.xhtml" media-type="application/xhtml+xml" media-overlay="smil{i:03d}"/>\n'
    
    opf_content += '  </manifest>\n  <spine>\n'
    
    # Add spine items
    for i in range(1, len(chapters) + 1):
        opf_content += f'    <itemref idref="chapter{i:03d}"/>\n'
    
    opf_content += '  </spine>\n</package>\n'
    
    package_opf = oebps / 'package.opf'
    package_opf.write_text(opf_content, encoding='utf-8')


def _create_toc_xhtml(temp_dir: Path, book_meta: Dict[str, Any], chapters: List[Dict[str, Any]]):
    """Create OEBPS/toc.xhtml navigation document."""
    oebps = temp_dir / 'OEBPS'
    
    title = book_meta.get('title', 'Untitled')
    
    toc_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>{title}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Table of Contents</h1>
      <ol>
'''
    
    for i, chapter in enumerate(chapters, 1):
        chapter_title = chapter.get('title', f'Chapter {i}')
        toc_content += f'        <li><a href="text/chapter{i:03d}.xhtml">{chapter_title}</a></li>\n'
    
    toc_content += '''      </ol>
    </nav>
  </body>
</html>
'''
    
    toc_xhtml = oebps / 'toc.xhtml'
    toc_xhtml.write_text(toc_content, encoding='utf-8')


def _create_chapter_xhtml(
    temp_dir: Path,
    chapter_num: int,
    chapter: Dict[str, Any]
):
    """Create OEBPS/text/chapterXXX.xhtml file."""
    text_dir = temp_dir / 'OEBPS' / 'text'
    text_dir.mkdir(exist_ok=True)
    
    chapter_title = chapter.get('title', f'Chapter {chapter_num}')
    
    xhtml_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>{chapter_title}</title>
  </head>
  <body>
    <section id="chapter{chapter_num:03d}" epub:type="chapter">
      <h1>{chapter_title}</h1>
    </section>
  </body>
</html>
'''
    
    xhtml_file = text_dir / f'chapter{chapter_num:03d}.xhtml'
    xhtml_file.write_text(xhtml_content, encoding='utf-8')


def _create_smil_file(
    temp_dir: Path,
    chapter_num: int,
    audio_file: str,
    duration: float
):
    """Create OEBPS/smil/chapterXXX.smil synchronization file."""
    smil_dir = temp_dir / 'OEBPS' / 'smil'
    smil_dir.mkdir(exist_ok=True)
    
    # Format duration as HH:MM:SS.mmm
    hours = int(duration // 3600)
    minutes = int((duration % 3600) // 60)
    seconds = duration % 60
    duration_str = f'{hours:02d}:{minutes:02d}:{seconds:06.3f}'
    
    smil_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0">
  <body>
    <seq id="seq{chapter_num:03d}" epub:textref="../text/chapter{chapter_num:03d}.xhtml">
      <par id="par{chapter_num:03d}">
        <text src="../text/chapter{chapter_num:03d}.xhtml#chapter{chapter_num:03d}"/>
        <audio src="../audio/{audio_file}" clipBegin="0:00:00.000" clipEnd="{duration_str}"/>
      </par>
    </seq>
  </body>
</smil>
'''
    
    smil_file = smil_dir / f'chapter{chapter_num:03d}.smil'
    smil_file.write_text(smil_content, encoding='utf-8')


def create_epub3_package(
    project_root: str,
    bitrate: str = '192k',
    sample_rate: int = 44100,
    channels: int = 1
) -> Optional[str]:
    """
    Create EPUB3 package for Kobo.
    
    Args:
        project_root: Root directory of the project
        bitrate: MP3 bitrate (default: 192k)
        sample_rate: Sample rate in Hz (default: 44100)
        channels: Number of audio channels (default: 1 for mono)
    
    Returns:
        Path to created EPUB file, or None on failure
    """
    root = Path(project_root)
    
    print("[INFO] Starting EPUB3 packaging for Kobo...")
    print(f"[INFO] Audio specs: {bitrate}, {sample_rate}Hz, {channels} channel(s)")
    
    # Load project config
    project_config_path = root / 'project.khipu.json'
    if not project_config_path.exists():
        print("[ERROR] project.khipu.json not found")
        return None
    
    with open(project_config_path, 'r', encoding='utf-8') as f:
        project_config = json.load(f)
    
    # Load book metadata from multiple possible locations
    book_meta = {}
    book_meta_paths = [
        root / 'dossier' / 'book.json',
        root / 'book.meta.json'
    ]
    for path in book_meta_paths:
        if path.exists():
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    book_meta = json.load(f)
                    break
            except Exception:
                continue
    
    # Fallback to project config if no separate book metadata file
    if not book_meta:
        book_meta = project_config.get('bookMeta', {})
    
    # Get book metadata
    title = book_meta.get('title', 'Untitled')
    sanitized_title = _sanitize_filename(title)
    
    print(f"[INFO] Book: {title}")
    
    # Load manifest
    manifest_path = root / 'manifest.json'
    if not manifest_path.exists():
        print("[ERROR] manifest.json not found")
        return None
    
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    
    chapters = manifest.get('chapters', [])
    if not chapters:
        print("[ERROR] No chapters found in manifest")
        return None
    
    print(f"[INFO] Processing {len(chapters)} chapters")
    
    # Create temporary directory for EPUB structure
    temp_dir = Path(tempfile.mkdtemp(prefix='khipu_epub_'))
    
    try:
        # Create audio directory
        audio_dir = temp_dir / 'OEBPS' / 'audio'
        audio_dir.mkdir(parents=True, exist_ok=True)
        
        # Process each chapter
        audio_files = []
        chapter_data = []
        
        for idx, chapter in enumerate(chapters, 1):
            chapter_id = chapter.get('id', f'chapter_{idx}')
            chapter_title = chapter.get('title', f'Chapter {idx}')
            
            print(f"[INFO] Processing chapter {idx}/{len(chapters)}: {chapter_title}")
            
            # Find audio file
            audio_wav_dir = root / 'audio' / 'wav'
            audio_file = audio_wav_dir / f'{chapter_id}_complete.wav'
            if not audio_file.exists():
                audio_file = audio_wav_dir / f'{chapter_id}.wav'
            
            # Fallback to audio/chapters/ directory
            if not audio_file.exists():
                audio_chapters_dir = root / 'audio' / 'chapters'
                audio_file = audio_chapters_dir / f'{chapter_id}_complete.wav'
            if not audio_file.exists():
                audio_file = audio_chapters_dir / f'{chapter_id}.wav'
            
            if not audio_file.exists():
                print(f"[WARNING] No audio file found for {chapter_id}, skipping")
                continue
            
            # Convert to MP3
            mp3_filename = f'chapter_{idx:03d}.mp3'
            mp3_path = audio_dir / mp3_filename
            
            print(f"[INFO] Converting to MP3: {mp3_filename}")
            if not _convert_to_mp3(audio_file, mp3_path, bitrate, sample_rate, channels):
                print(f"[ERROR] Failed to convert {chapter_id}")
                continue
            
            # Get duration
            duration = _get_audio_duration(mp3_path)
            
            # Create chapter XHTML
            _create_chapter_xhtml(temp_dir, idx, chapter)
            
            # Create SMIL file
            _create_smil_file(temp_dir, idx, mp3_filename, duration)
            
            audio_files.append(mp3_filename)
            chapter_data.append(chapter)
        
        if not audio_files:
            print("[ERROR] No audio files were successfully processed")
            return None
        
        print(f"[SUCCESS] Processed {len(audio_files)} audio files")
        
        # Create EPUB structure files
        print("[INFO] Creating EPUB structure files...")
        _create_mimetype_file(temp_dir)
        _create_container_xml(temp_dir)
        _create_package_opf(temp_dir, book_meta, chapter_data, audio_files)
        _create_toc_xhtml(temp_dir, book_meta, chapter_data)
        
        # Create output directory
        export_dir = root / 'exports' / 'kobo'
        export_dir.mkdir(parents=True, exist_ok=True)
        
        # Create EPUB file (ZIP with specific structure)
        epub_path = export_dir / f'{sanitized_title}.epub'
        
        print(f"[INFO] Creating EPUB archive: {epub_path.name}")
        
        with zipfile.ZipFile(epub_path, 'w', zipfile.ZIP_DEFLATED) as epub_zip:
            # Add mimetype first, uncompressed
            epub_zip.write(temp_dir / 'mimetype', 'mimetype', compress_type=zipfile.ZIP_STORED)
            
            # Add all other files
            for file_path in temp_dir.rglob('*'):
                if file_path.is_file() and file_path.name != 'mimetype':
                    arcname = str(file_path.relative_to(temp_dir))
                    epub_zip.write(file_path, arcname)
        
        print(f"[SUCCESS] EPUB3 package created: {epub_path}")
        return str(epub_path)
    
    except Exception as e:
        print(f"[ERROR] Packaging failed: {e}")
        import traceback
        traceback.print_exc()
        return None
    
    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Create EPUB3 package for Kobo')
    parser.add_argument('project_root', help='Project root directory')
    parser.add_argument('--bitrate', default='192k', help='MP3 bitrate (default: 192k)')
    parser.add_argument('--sample-rate', type=int, default=44100, help='Sample rate in Hz (default: 44100)')
    parser.add_argument('--channels', type=int, default=1, help='Number of channels (default: 1)')
    
    args = parser.parse_args()
    
    result = create_epub3_package(
        args.project_root,
        bitrate=args.bitrate,
        sample_rate=args.sample_rate,
        channels=args.channels
    )
    
    if result:
        print(f"\n[SUCCESS] Package created: {result}")
        exit(0)
    else:
        print("\n[ERROR] Packaging failed")
        exit(1)


if __name__ == '__main__':
    main()
