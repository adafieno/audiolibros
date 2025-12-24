"""
EPUB3 Packager for Kobo (Cloud Version)

Creates EPUB3 audiobook with Media Overlays.

Format: EPUB3 with MP3 audio + SMIL synchronization
Specs: 192kbps, 44.1kHz, stereo, 200MB max package size
"""

import asyncio
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Callable
import uuid
from datetime import datetime


class EPUB3Packager:
    """Packages audiobook as EPUB3 with Media Overlays for Kobo."""
    
    def __init__(self):
        self.ffmpeg_path = "ffmpeg"
        
    async def package(
        self,
        chapter_audio: Dict[str, Path],
        chapters_info: List[Dict],
        book_metadata: Dict,
        cover_image_path: Optional[Path],
        output_path: Path,
        audio_spec: Dict,
        progress_callback: Optional[Callable[[str, int], None]] = None
    ) -> Dict:
        """
        Create EPUB3 package with Media Overlays.
        
        Args:
            chapter_audio: Dict mapping chapter_id -> audio file path
            chapters_info: List of chapter info with title, chapter_number
            book_metadata: Book metadata (title, authors, narrators, etc.)
            cover_image_path: Path to cover image file
            output_path: Where to write the EPUB file
            audio_spec: Audio specification (codec, bitrate_kbps, sample_rate_hz, channels)
            progress_callback: Optional callback(message, percent)
        
        Returns:
            Package info dict with file_path, size_bytes, chapter_count
        """
        
        if progress_callback:
            await progress_callback("Preparing EPUB3 package", 0)
        
        import tempfile
        with tempfile.TemporaryDirectory(prefix='epub3_kobo_') as temp_dir:
            temp_path = Path(temp_dir)
            
            # Create EPUB structure
            epub_dir = temp_path / "epub_content"
            epub_dir.mkdir()
            
            # Create required directories
            (epub_dir / "META-INF").mkdir()
            (epub_dir / "OEBPS").mkdir()
            (epub_dir / "OEBPS" / "audio").mkdir()
            (epub_dir / "OEBPS" / "text").mkdir()
            if cover_image_path:
                (epub_dir / "OEBPS" / "images").mkdir()
            
            # Step 1: Create mimetype file
            if progress_callback:
                await progress_callback("Creating EPUB structure", 10)
            
            self._create_mimetype(epub_dir)
            
            # Step 2: Create container.xml
            self._create_container_xml(epub_dir)
            
            # Step 3: Convert chapter audio to MP3 and create XHTML + SMIL
            if progress_callback:
                await progress_callback("Converting audio to MP3", 20)
            
            mp3_files = await self._convert_chapters_to_mp3(
                chapter_audio,
                chapters_info,
                epub_dir / "OEBPS" / "audio",
                audio_spec,
                progress_callback
            )
            
            # Step 4: Create content files
            if progress_callback:
                await progress_callback("Creating EPUB content", 70)
            
            self._create_xhtml_files(
                chapters_info,
                mp3_files,
                epub_dir / "OEBPS" / "text"
            )
            
            self._create_smil_files(
                chapters_info,
                mp3_files,
                epub_dir / "OEBPS"
            )
            
            # Step 5: Copy cover image
            cover_filename = None
            if cover_image_path and cover_image_path.exists():
                cover_filename = f"cover{cover_image_path.suffix}"
                import shutil
                shutil.copy(cover_image_path, epub_dir / "OEBPS" / "images" / cover_filename)
            
            # Step 6: Create package document (OPF)
            self._create_package_opf(
                chapters_info,
                mp3_files,
                book_metadata,
                cover_filename,
                epub_dir / "OEBPS"
            )
            
            # Step 7: Create navigation document
            self._create_nav_document(
                chapters_info,
                epub_dir / "OEBPS"
            )
            
            # Step 8: Package as EPUB (ZIP with specific structure)
            if progress_callback:
                await progress_callback("Creating EPUB package", 90)
            
            await self._create_epub_zip(epub_dir, output_path)
            
            # Validate size (Kobo has 200MB limit)
            size_bytes = output_path.stat().st_size
            size_mb = size_bytes / (1024 * 1024)
            
            if size_mb > 200:
                raise RuntimeError(f"EPUB3 package exceeds Kobo's 200MB limit: {size_mb:.2f}MB")
            
            if progress_callback:
                await progress_callback("EPUB3 package complete", 100)
            
            return {
                "file_path": str(output_path),
                "size_bytes": size_bytes,
                "format": "epub3",
                "chapter_count": len(chapters_info),
                "size_mb": round(size_mb, 2)
            }
    
    def _create_mimetype(self, epub_dir: Path):
        """Create mimetype file (must be first, uncompressed)."""
        (epub_dir / "mimetype").write_text("application/epub+zip", encoding='utf-8')
    
    def _create_container_xml(self, epub_dir: Path):
        """Create META-INF/container.xml."""
        content = '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>'''
        (epub_dir / "META-INF" / "container.xml").write_text(content, encoding='utf-8')
    
    async def _convert_chapters_to_mp3(
        self,
        chapter_audio: Dict[str, Path],
        chapters_info: List[Dict],
        audio_dir: Path,
        audio_spec: Dict,
        progress_callback: Optional[Callable]
    ) -> List[Dict]:
        """Convert chapter audio to MP3 format."""
        
        mp3_files = []
        total = len(chapters_info)
        
        for i, chapter in enumerate(sorted(chapters_info, key=lambda c: c.get('chapter_number', 0))):
            chapter_id = chapter['chapter_id']
            
            if chapter_id not in chapter_audio:
                continue
            
            if progress_callback:
                percent = 20 + int((i / total) * 50)
                await progress_callback(f"Converting chapter {i+1}/{total}", percent)
            
            chapter_num = chapter.get('chapter_number', i + 1)
            mp3_filename = f"chapter_{chapter_num:03d}.mp3"
            mp3_path = audio_dir / mp3_filename
            
            # Convert to MP3
            bitrate = audio_spec.get('bitrate_kbps', 192)
            sample_rate = audio_spec.get('sample_rate_hz', 44100)
            channels = audio_spec.get('channels', 2)
            
            cmd = [
                self.ffmpeg_path,
                '-i', str(chapter_audio[chapter_id]),
                '-codec:a', 'libmp3lame',
                '-b:a', f'{bitrate}k',
                '-ar', str(sample_rate),
                '-ac', str(channels),
                '-y',
                str(mp3_path)
            ]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            await process.communicate()
            
            if process.returncode != 0:
                raise RuntimeError(f"Failed to convert chapter {chapter_num} to MP3")
            
            mp3_files.append({
                "chapter_id": chapter_id,
                "chapter_num": chapter_num,
                "filename": mp3_filename,
                "title": chapter['title'],
                "duration_ms": chapter['duration_ms']
            })
        
        return mp3_files
    
    def _create_xhtml_files(
        self,
        chapters_info: List[Dict],
        mp3_files: List[Dict],
        text_dir: Path
    ):
        """Create XHTML content files for each chapter."""
        
        for mp3_info in mp3_files:
            xhtml_filename = f"chapter_{mp3_info['chapter_num']:03d}.xhtml"
            xhtml_path = text_dir / xhtml_filename
            
            content = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>{mp3_info['title']}</title>
</head>
<body>
  <section id="chapter_{mp3_info['chapter_num']}" epub:type="chapter">
    <h1 id="ch{mp3_info['chapter_num']}_title">{mp3_info['title']}</h1>
    <p id="ch{mp3_info['chapter_num']}_audio">[Audio content]</p>
  </section>
</body>
</html>'''
            xhtml_path.write_text(content, encoding='utf-8')
    
    def _create_smil_files(
        self,
        chapters_info: List[Dict],
        mp3_files: List[Dict],
        oebps_dir: Path
    ):
        """Create SMIL files for Media Overlay synchronization."""
        
        for mp3_info in mp3_files:
            smil_filename = f"chapter_{mp3_info['chapter_num']:03d}.smil"
            smil_path = oebps_dir / smil_filename
            
            duration_seconds = mp3_info['duration_ms'] / 1000.0
            
            content = f'''<?xml version="1.0" encoding="UTF-8"?>
<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0">
  <body>
    <seq id="seq_ch{mp3_info['chapter_num']}" epub:textref="text/chapter_{mp3_info['chapter_num']:03d}.xhtml" 
         xmlns:epub="http://www.idpf.org/2007/ops">
      <par id="par_ch{mp3_info['chapter_num']}_title">
        <text src="text/chapter_{mp3_info['chapter_num']:03d}.xhtml#ch{mp3_info['chapter_num']}_title"/>
        <audio src="audio/{mp3_info['filename']}" clipBegin="0s" clipEnd="{duration_seconds:.3f}s"/>
      </par>
    </seq>
  </body>
</smil>'''
            smil_path.write_text(content, encoding='utf-8')
    
    def _create_package_opf(
        self,
        chapters_info: List[Dict],
        mp3_files: List[Dict],
        book_metadata: Dict,
        cover_filename: Optional[str],
        oebps_dir: Path
    ):
        """Create package.opf (OPF manifest document)."""
        
        book_id = str(uuid.uuid4())
        title = book_metadata.get('title', 'Untitled')
        authors = book_metadata.get('authors', [])
        language = book_metadata.get('language', 'en')
        
        # Build manifest items
        manifest_items = []
        spine_items = []
        
        # Add chapters
        for mp3_info in mp3_files:
            ch_num = mp3_info['chapter_num']
            
            # XHTML
            manifest_items.append(
                f'    <item id="xhtml_ch{ch_num}" href="text/chapter_{ch_num:03d}.xhtml" '
                f'media-type="application/xhtml+xml" media-overlay="smil_ch{ch_num}"/>'
            )
            spine_items.append(f'    <itemref idref="xhtml_ch{ch_num}"/>')
            
            # MP3
            manifest_items.append(
                f'    <item id="audio_ch{ch_num}" href="audio/{mp3_info["filename"]}" '
                f'media-type="audio/mpeg"/>'
            )
            
            # SMIL
            manifest_items.append(
                f'    <item id="smil_ch{ch_num}" href="chapter_{ch_num:03d}.smil" '
                f'media-type="application/smil+xml"/>'
            )
        
        # Add cover if present
        if cover_filename:
            ext = Path(cover_filename).suffix.lower()
            media_type = "image/jpeg" if ext in ['.jpg', '.jpeg'] else "image/png"
            manifest_items.append(
                f'    <item id="cover_img" href="images/{cover_filename}" '
                f'media-type="{media_type}" properties="cover-image"/>'
            )
        
        # Add navigation
        manifest_items.append(
            '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" '
            'properties="nav"/>'
        )
        
        opf_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book_id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book_id">{book_id}</dc:identifier>
    <dc:title>{title}</dc:title>
    {chr(10).join(f"    <dc:creator>{author}</dc:creator>" for author in authors)}
    <dc:language>{language}</dc:language>
    <meta property="dcterms:modified">{datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}</meta>
    <meta property="media:duration">{sum(m["duration_ms"] for m in mp3_files) / 1000:.0f}s</meta>
    <meta property="media:narrator">{", ".join(book_metadata.get("narrators", []))}</meta>
  </metadata>
  <manifest>
{chr(10).join(manifest_items)}
  </manifest>
  <spine>
{chr(10).join(spine_items)}
  </spine>
</package>'''
        
        (oebps_dir / "package.opf").write_text(opf_content, encoding='utf-8')
    
    def _create_nav_document(
        self,
        chapters_info: List[Dict],
        oebps_dir: Path
    ):
        """Create navigation document (nav.xhtml)."""
        
        nav_items = []
        for i, chapter in enumerate(sorted(chapters_info, key=lambda c: c.get('chapter_number', 0)), 1):
            nav_items.append(
                f'      <li><a href="text/chapter_{i:03d}.xhtml">{chapter["title"]}</a></li>'
            )
        
        content = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Navigation</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
{chr(10).join(nav_items)}
    </ol>
  </nav>
</body>
</html>'''
        
        (oebps_dir / "nav.xhtml").write_text(content, encoding='utf-8')
    
    async def _create_epub_zip(self, epub_dir: Path, output_path: Path):
        """Package EPUB directory as ZIP file."""
        
        with zipfile.ZipFile(output_path, 'w') as zf:
            # Add mimetype first (uncompressed)
            zf.write(epub_dir / "mimetype", "mimetype", compress_type=zipfile.ZIP_STORED)
            
            # Add all other files
            for file_path in epub_dir.rglob('*'):
                if file_path.is_file() and file_path.name != 'mimetype':
                    arcname = str(file_path.relative_to(epub_dir))
                    zf.write(file_path, arcname, compress_type=zipfile.ZIP_DEFLATED)
