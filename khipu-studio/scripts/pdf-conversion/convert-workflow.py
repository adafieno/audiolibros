#!/usr/bin/env python3
"""
Audeek Workflow - Markdown to PDF Converter
Convert the workflow markdown document to a professional PDF
"""

import os
import sys
from pathlib import Path
import markdown
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration

def create_custom_css():
    """Create custom CSS for professional PDF styling"""
    return """
    @page {
        size: A4;
        margin: 2.5cm;
        @top-center {
            content: "Audeek: Flujo de Trabajo de Audiolibros";
            font-size: 10pt;
            color: #666;
            border-bottom: 1px solid #ddd;
            padding-bottom: 0.5em;
        }
        @bottom-center {
            content: "Página " counter(page);
            font-size: 10pt;
            color: #666;
        }
    }
    
    body {
        font-family: 'Segoe UI', 'DejaVu Sans', Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        font-size: 11pt;
    }
    
    h1, h2, h3, h4, h5, h6 {
        color: #2c5aa0;
        font-weight: bold;
        margin-top: 1.5em;
        margin-bottom: 0.5em;
        page-break-after: avoid;
    }
    
    h1 {
        font-size: 24pt;
        text-align: center;
        border-bottom: 3px solid #2c5aa0;
        padding-bottom: 0.5em;
        page-break-before: always;
        margin-top: 0;
    }
    
    h1:first-of-type {
        page-break-before: auto;
    }
    
    h2 {
        font-size: 18pt;
        border-bottom: 2px solid #e6e6e6;
        padding-bottom: 0.3em;
        page-break-before: auto;
    }
    
    h3 {
        font-size: 14pt;
        color: #4a4a4a;
    }
    
    h4 {
        font-size: 12pt;
        color: #666;
    }
    
    p {
        margin-bottom: 0.8em;
        text-align: justify;
        orphans: 2;
        widows: 2;
    }
    
    ul, ol {
        margin-bottom: 1em;
        padding-left: 2em;
        page-break-inside: avoid;
    }
    
    li {
        margin-bottom: 0.3em;
    }
    
    strong {
        color: #2c5aa0;
        font-weight: bold;
    }
    
    em {
        font-style: italic;
        color: #555;
    }
    
    code {
        background-color: #f4f4f4;
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 9pt;
    }
    
    pre {
        background-color: #f8f8f8;
        border: 1px solid #ddd;
        border-radius: 5px;
        padding: 1em;
        margin: 1em 0;
        overflow-x: auto;
        font-size: 9pt;
        page-break-inside: avoid;
    }
    
    blockquote {
        border-left: 4px solid #2c5aa0;
        margin: 1em 0;
        padding: 0.5em 1em;
        background-color: #f8f9fa;
        font-style: italic;
        page-break-inside: avoid;
    }
    
    table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
        page-break-inside: avoid;
    }
    
    th, td {
        border: 1px solid #ddd;
        padding: 0.5em;
        text-align: left;
    }
    
    th {
        background-color: #2c5aa0;
        color: white;
        font-weight: bold;
    }
    
    tr:nth-child(even) {
        background-color: #f9f9f9;
    }
    
    /* Mermaid diagram placeholder */
    .mermaid {
        background-color: #e8f4f8;
        border: 2px dashed #2c5aa0;
        padding: 2em;
        text-align: center;
        margin: 1em 0;
        border-radius: 5px;
        color: #2c5aa0;
        font-weight: bold;
        page-break-inside: avoid;
    }
    
    .mermaid::before {
        content: "Diagrama de Flujo de Trabajo - Mermaid";
        display: block;
        font-size: 14pt;
        margin-bottom: 1em;
    }
    
    /* Table of contents styling */
    .toc {
        background-color: #f8f9fa;
        border: 1px solid #e6e6e6;
        border-radius: 5px;
        padding: 1em;
        margin: 2em 0;
        page-break-inside: avoid;
    }
    
    .toc h2 {
        margin-top: 0;
        color: #2c5aa0;
        border-bottom: none;
        font-size: 16pt;
    }
    
    .toc ul {
        list-style-type: none;
        padding-left: 0;
    }
    
    .toc li {
        margin-bottom: 0.5em;
    }
    
    .toc a {
        color: #2c5aa0;
        text-decoration: none;
    }
    
    /* Context blocks */
    .context {
        background-color: #e8f4f8;
        border-left: 4px solid #2c5aa0;
        padding: 1em;
        margin: 1em 0;
        border-radius: 0 5px 5px 0;
        page-break-inside: avoid;
    }
    
    /* Page breaks */
    .page-break {
        page-break-before: always;
    }
    
    hr {
        border: none;
        border-top: 2px solid #e6e6e6;
        margin: 2em 0;
    }
    """

def preprocess_markdown(content):
    """Preprocess markdown content for better PDF conversion"""
    # Replace mermaid code blocks with placeholder
    import re
    
    # Replace mermaid diagrams
    content = re.sub(
        r'```mermaid\n(.*?)\n```',
        r'<div class="mermaid">Diagrama de Flujo de Trabajo</div>',
        content,
        flags=re.DOTALL
    )
    
    # Enhance context block (the first paragraph after title)
    content = re.sub(
        r'\*\*Contexto:\*\*(.*?)(?=\n\n---)',
        r'<div class="context"><strong>Contexto:</strong>\1</div>',
        content,
        flags=re.DOTALL
    )
    
    return content

def convert_to_pdf():
    """Main conversion function"""
    print("Audeek Workflow - Markdown to PDF Converter")
    print("=" * 50)
    
    # File paths
    input_file = Path("c:/code/audiolibros/flujo_de_trabajo/audiolibros_flujo_de_trabajo_ui.md")
    output_file = Path("c:/code/audiolibros/flujo_de_trabajo/Audeek-Flujo-de-Trabajo-Audiolibros.pdf")
    
    # Check if input file exists
    if not input_file.exists():
        print(f"Error: Input file not found: {input_file}")
        sys.exit(1)
    
    print(f"Input:  {input_file}")
    print(f"Output: {output_file}")
    print()
    
    try:
        # Read markdown content
        print("Reading markdown file...")
        with open(input_file, 'r', encoding='utf-8') as f:
            markdown_content = f.read()
        
        # Preprocess markdown
        print("Preprocessing markdown...")
        markdown_content = preprocess_markdown(markdown_content)
        
        # Convert markdown to HTML
        print("Converting markdown to HTML...")
        md = markdown.Markdown(extensions=[
            'tables',
            'fenced_code',
            'toc',
            'codehilite',
            'attr_list'
        ])
        html_content = md.convert(markdown_content)
        
        # Create complete HTML document
        html_doc = f"""
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Audeek: Flujo de Trabajo de Audiolibros</title>
        </head>
        <body>
            {html_content}
        </body>
        </html>
        """
        
        # Create CSS
        print("Applying custom styling...")
        css = CSS(string=create_custom_css())
        
        # Convert to PDF
        print("Generating PDF...")
        font_config = FontConfiguration()
        html_obj = HTML(string=html_doc)
        
        html_obj.write_pdf(
            output_file,
            stylesheets=[css],
            font_config=font_config
        )
        
        print(f"✓ PDF created successfully: {output_file}")
        print(f"  File size: {output_file.stat().st_size / 1024:.1f} KB")
        
        # Ask if user wants to open the PDF
        try:
            response = input("\nWould you like to open the PDF now? (y/n): ").strip().lower()
            if response in ['y', 'yes', 'sí', 'si']:
                import subprocess
                subprocess.run(['start', '', str(output_file)], shell=True, check=False)
        except KeyboardInterrupt:
            print("\nConversion completed.")
        
    except Exception as e:
        print(f"✗ Error during conversion: {e}")
        sys.exit(1)

if __name__ == "__main__":
    convert_to_pdf()