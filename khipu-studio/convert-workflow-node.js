const fs = require('fs');
const path = require('path');

// Enhanced markdown to HTML converter
function markdownToHtml(markdown) {
    // First, handle horizontal rules (--- becomes <hr>)
    markdown = markdown.replace(/^---$/gm, '<hr>');
    
    // Handle Table of Contents section specially
    markdown = markdown.replace(/## Tabla de Contenidos\n\n([\s\S]*?)(?=\n---)/gm, (match, tocContent) => {
        // Parse TOC items
        const tocItems = tocContent.match(/\d+\.\s*\[[^\]]+\]\([^)]+\)/g) || [];
        
        let tocHtml = '<h2>Tabla de Contenidos</h2>\n<div class="toc-container">\n<ol class="toc-list">\n';
        
        tocItems.forEach(item => {
            const match = item.match(/(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)/);
            if (match) {
                const [, number, title, href] = match;
                tocHtml += `<li class="toc-item"><span class="toc-number">${number}.</span> <span class="toc-title">${title}</span></li>\n`;
            }
        });
        
        tocHtml += '</ol>\n</div>';
        return tocHtml;
    });
    
    // Handle mermaid diagrams - remove the code and create a visual flowchart
    markdown = markdown.replace(/```mermaid\n([\s\S]*?)\n```/gm, (match, content) => {
        return `<div class="mermaid-flowchart">
            <h4>Diagrama de Flujo de Trabajo</h4>
            <div class="workflow-steps">
                <div class="step-box start">Gestión de Proyecto</div>
                <div class="arrow">↓</div>
                <div class="step-box">Preparación Editorial</div>
                <div class="arrow">↓</div>
                <div class="step-box">Procesamiento del Manuscrito</div>
                <div class="arrow">↓</div>
                <div class="step-box">Casting de Voces</div>
                <div class="arrow">↓</div>
                <div class="step-box">Desarrollo de Personajes</div>
                <div class="arrow">↓</div>
                <div class="step-box highlight">Planificación Avanzada</div>
                <div class="arrow">↓</div>
                <div class="step-box">Orquestación</div>
                <div class="arrow">↓</div>
                <div class="step-box">Producción de Audio</div>
                <div class="arrow">↓</div>
                <div class="step-box critical">Control de Costos</div>
                <div class="arrow">↓</div>
                <div class="step-box end">Empaquetado Final</div>
            </div>
        </div>`;
    });
    
    // Split into paragraphs first to handle spacing better
    let sections = markdown.split(/\n\s*\n/);
    
    sections = sections.map(section => {
        // Skip sections that are already processed (TOC, mermaid)
        if (section.includes('<div class="toc-container">') || section.includes('<div class="mermaid-flowchart">')) {
            return section;
        }
        
        return section
            // Headers
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
            // Bold and italic
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Code blocks (but not mermaid ones)
            .replace(/```(?!mermaid)([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Lists - handle multi-line lists properly
            .replace(/^\* (.+)$/gm, '<li>$1</li>')
            // Links (remove href since they don't work in PDF)
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
            // Single line breaks within paragraphs
            .replace(/\n(?!<)/g, ' ');
    });
    
    // Wrap non-header content in paragraphs and handle lists
    sections = sections.map(section => {
        // Skip already processed sections
        if (section.includes('<div class="toc-container">') || 
            section.includes('<div class="mermaid-flowchart">')) {
            return section;
        }
        
        if (section.includes('<li>')) {
            section = section.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        }
        
        if (!section.match(/^<(h[1-6]|hr|div|ul|pre)/)) {
            section = `<p>${section}</p>`;
        }
        
        return section;
    });
    
    return sections.join('\n');
}

// HTML template with professional styling
const htmlTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Audeek: Flujo de Trabajo de Audiolibros</title>
    <style>
        @page {
            size: A4;
            margin: 2.5cm;
        }
        
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            font-size: 11pt;
            max-width: 100%;
        }
        
        h1, h2, h3, h4, h5, h6 {
            color: #2c5aa0;
            font-weight: bold;
            margin-top: 1.2em;
            margin-bottom: 0.6em;
            page-break-after: avoid;
        }
        
        h1 {
            font-size: 24pt;
            text-align: center;
            border-bottom: 3px solid #2c5aa0;
            padding-bottom: 0.5em;
            margin-top: 0;
            margin-bottom: 1em;
        }
        
        h1:first-of-type {
            margin-top: 0;
        }
        
        h2 {
            font-size: 18pt;
            border-bottom: 2px solid #e6e6e6;
            padding-bottom: 0.3em;
            margin-top: 1.5em;
            margin-bottom: 0.8em;
        }
        
        h3 {
            font-size: 14pt;
            color: #4a4a4a;
            margin-top: 1.2em;
            margin-bottom: 0.6em;
        }
        
        h4 {
            font-size: 12pt;
            color: #666;
            margin-top: 1em;
            margin-bottom: 0.5em;
        }
        
        p {
            margin-top: 0.4em;
            margin-bottom: 0.6em;
            text-align: justify;
        }
        
        ul, ol {
            margin-top: 0.5em;
            margin-bottom: 0.8em;
            padding-left: 2em;
        }
        
        li {
            margin-bottom: 0.2em;
            line-height: 1.4;
        }
        
        strong {
            color: #2c5aa0;
            font-weight: bold;
        }
        
        code {
            background-color: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: Consolas, Monaco, monospace;
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
        }
        
        .toc-container {
            background-color: #f8f9fa;
            border: 1px solid #e6e6e6;
            border-radius: 5px;
            padding: 1.5em;
            margin: 1em 0;
            page-break-inside: avoid;
        }
        
        .toc-list {
            list-style: none;
            padding-left: 0;
            margin: 0;
        }
        
        .toc-item {
            display: flex;
            margin-bottom: 0.5em;
            padding: 0.3em 0;
            border-bottom: 1px dotted #ddd;
        }
        
        .toc-number {
            color: #2c5aa0;
            font-weight: bold;
            min-width: 2em;
            margin-right: 0.5em;
        }
        
        .toc-title {
            color: #333;
            flex-grow: 1;
        }
        
        .mermaid-flowchart {
            background-color: #f8f9fa;
            border: 2px solid #2c5aa0;
            border-radius: 8px;
            padding: 1.5em;
            margin: 1.5em 0;
            text-align: center;
            page-break-inside: avoid;
        }
        
        .mermaid-flowchart h4 {
            color: #2c5aa0;
            margin-top: 0;
            margin-bottom: 1em;
            font-size: 14pt;
        }
        
        .workflow-steps {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5em;
        }
        
        .step-box {
            background-color: #2E7D32;
            color: white;
            padding: 0.8em 1.2em;
            border-radius: 5px;
            font-weight: bold;
            min-width: 200px;
            text-align: center;
            border: 2px solid #1B5E20;
        }
        
        .step-box.start {
            background-color: #1565C0;
            border-color: #0D47A1;
        }
        
        .step-box.end {
            background-color: #1565C0;
            border-color: #0D47A1;
        }
        
        .step-box.highlight {
            background-color: #4A148C;
            border-color: #311B92;
        }
        
        .step-box.critical {
            background-color: #B71C1C;
            border-color: #7F0000;
        }
        
        .arrow {
            color: #2c5aa0;
            font-size: 18pt;
            font-weight: bold;
            margin: 0.2em 0;
        }
        
        hr {
            border: none;
            border-top: 2px solid #2c5aa0;
            margin: 1em 0;
            height: 2px;
            background-color: #2c5aa0;
        }
    </style>
</head>
<body>
    {{CONTENT}}
</body>
</html>`;

async function convertWorkflowToPdf() {
    console.log('Converting Audeek Workflow to PDF...');
    
    const inputFile = 'c:\\code\\audiolibros\\flujo_de_trabajo\\audiolibros_flujo_de_trabajo_ui.md';
    const outputDir = 'c:\\code\\audiolibros\\flujo_de_trabajo';
    const outputFile = 'Audeek-Flujo-de-Trabajo-Audiolibros.pdf';
    const outputPath = path.join(outputDir, outputFile);
    
    try {
        // Check if Puppeteer is installed
        let puppeteer;
        try {
            puppeteer = require('puppeteer');
        } catch (error) {
            console.log('Installing Puppeteer...');
            const { execSync } = require('child_process');
            execSync('npm install puppeteer', { stdio: 'inherit' });
            puppeteer = require('puppeteer');
        }
        
        // Read the markdown file
        if (!fs.existsSync(inputFile)) {
            throw new Error(`Input file not found: ${inputFile}`);
        }
        
        console.log(`Reading: ${inputFile}`);
        const markdown = fs.readFileSync(inputFile, 'utf8');
        
        // Convert markdown to HTML
        console.log('Converting markdown to HTML...');
        let html = markdownToHtml(markdown);
        html = htmlTemplate.replace('{{CONTENT}}', `<p>${html}</p>`);
        
        // Launch Puppeteer and generate PDF
        console.log('Generating PDF...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        await page.setContent(html);
        await page.pdf({
            path: outputPath,
            format: 'A4',
            margin: {
                top: '2.5cm',
                right: '2.5cm',
                bottom: '2.5cm',
                left: '2.5cm'
            },
            printBackground: true
        });
        
        await browser.close();
        
        console.log(`✓ PDF created successfully: ${outputPath}`);
        
        // Ask if user wants to open the PDF
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('Would you like to open the PDF now? (y/n): ', (answer) => {
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                const { exec } = require('child_process');
                exec(`start "" "${outputPath}"`, (error) => {
                    if (error) console.log('Could not open PDF automatically');
                });
            }
            rl.close();
        });
        
    } catch (error) {
        console.error('✗ Error:', error.message);
        process.exit(1);
    }
}

convertWorkflowToPdf();