const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("📄 Khipu Studio - Markdown to PDF Converter");
console.log("============================================");

// Configuration
const config = {
    inputDir: 'docs',
    outputDir: 'docs/pdf',
    files: [
        { input: '03-user-guide.md', output: 'Khipu-Studio-User-Guide-EN.pdf', language: 'English' },
        { input: '03-user-guide-es-PE.md', output: 'Khipu-Studio-Guia-Usuario-ES.pdf', language: 'Español (Perú)' },
        { input: '03-user-guide-pt-BR.md', output: 'Khipu-Studio-Guia-Usuario-PT.pdf', language: 'Português (Brasil)' }
    ],
    pandocOptions: {
        engine: 'weasyprint', // Alternative: wkhtmltopdf
        paperSize: 'A4',
        margins: '2.5cm',
        fontSize: '11pt',
        fontFamily: 'Arial, sans-serif'
    }
};

// Ensure output directory exists
function ensureOutputDir() {
    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
        console.log(`📁 Created output directory: ${config.outputDir}`);
    }
}

// Check if pandoc is installed
function checkPandoc() {
    try {
        execSync('pandoc --version', { encoding: 'utf8', stdio: 'pipe' });
        console.log("✅ Pandoc is installed");
        return true;
    } catch (error) {
        console.log("❌ Pandoc not found. Installing via package manager...");
        return installPandoc();
    }
}

// Install pandoc (Windows)
function installPandoc() {
    try {
        console.log("📦 Installing Pandoc via Chocolatey...");
        execSync('choco install pandoc -y', { encoding: 'utf8' });
        console.log("✅ Pandoc installed successfully");
        return true;
    } catch (error) {
        console.log("❌ Failed to install Pandoc via Chocolatey.");
        console.log("Please install Pandoc manually from: https://pandoc.org/installing.html");
        return false;
    }
}

// Create CSS styles for PDF
function createPDFStyles() {
    const cssContent = `
/* PDF Styles for Khipu Studio User Guide */
@page {
    size: A4;
    margin: 2.5cm;
}

body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #333;
    max-width: none;
}

/* Headers */
h1 {
    color: #2c5aa0;
    font-size: 24pt;
    border-bottom: 3px solid #2c5aa0;
    padding-bottom: 10px;
    margin-top: 0;
    page-break-after: avoid;
}

h2 {
    color: #2c5aa0;
    font-size: 18pt;
    margin-top: 30px;
    margin-bottom: 15px;
    page-break-after: avoid;
}

h3 {
    color: #444;
    font-size: 14pt;
    margin-top: 25px;
    margin-bottom: 10px;
    page-break-after: avoid;
}

h4 {
    color: #666;
    font-size: 12pt;
    margin-top: 20px;
    margin-bottom: 8px;
}

/* Paragraphs and lists */
p {
    margin-bottom: 12px;
    text-align: justify;
}

ul, ol {
    margin-bottom: 15px;
    padding-left: 25px;
}

li {
    margin-bottom: 5px;
}

/* Strong text */
strong {
    color: #2c5aa0;
    font-weight: 600;
}

/* Code and technical elements */
code {
    background-color: #f5f5f5;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 10pt;
}

pre {
    background-color: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 15px;
    overflow-x: auto;
    margin: 15px 0;
}

/* Tables */
table {
    border-collapse: collapse;
    width: 100%;
    margin: 15px 0;
}

th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

th {
    background-color: #f2f2f2;
    font-weight: 600;
    color: #2c5aa0;
}

/* Images */
img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border: 1px solid #ddd;
    border-radius: 5px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* Page breaks */
.page-break {
    page-break-before: always;
}

/* Header with emoji support */
h1, h2, h3, h4, h5, h6 {
    font-family: 'Segoe UI Emoji', 'Segoe UI', Arial, sans-serif;
}

/* Blockquotes */
blockquote {
    border-left: 4px solid #2c5aa0;
    margin: 20px 0;
    padding-left: 20px;
    font-style: italic;
    color: #666;
}

/* Footer */
.footer {
    position: fixed;
    bottom: 2cm;
    left: 2.5cm;
    right: 2.5cm;
    text-align: center;
    font-size: 9pt;
    color: #888;
    border-top: 1px solid #ddd;
    padding-top: 10px;
}

/* Navigation elements styling */
ul li strong {
    color: #2c5aa0;
}

/* Step numbering */
h3[id^="paso-"], h3[id^="passo-"], h3[id^="step-"] {
    background-color: #f0f4f8;
    padding: 10px;
    border-left: 4px solid #2c5aa0;
    border-radius: 0 5px 5px 0;
}
`;

    const cssPath = path.join(config.outputDir, 'pdf-styles.css');
    fs.writeFileSync(cssPath, cssContent);
    return cssPath;
}

// Convert markdown to PDF using Pandoc
function convertToPDF(inputFile, outputFile, language) {
    const inputPath = path.join(config.inputDir, inputFile);
    const outputPath = path.join(config.outputDir, outputFile);
    const cssPath = createPDFStyles();
    
    if (!fs.existsSync(inputPath)) {
        console.log(`❌ Input file not found: ${inputPath}`);
        return false;
    }

    try {
        // Pandoc command with comprehensive options
        const pandocCmd = [
            'pandoc',
            `"${inputPath}"`,
            '-o', `"${outputPath}"`,
            '--from', 'markdown',
            '--to', 'pdf',
            '--pdf-engine=weasyprint',
            `--css="${cssPath}"`,
            '--standalone',
            '--toc',
            '--toc-depth=3',
            `--metadata title="Khipu Studio User Guide"`,
            `--metadata author="Khipu Studio Team"`,
            `--metadata lang="${language.toLowerCase()}"`,
            '--variable', 'geometry:margin=2.5cm',
            '--variable', 'fontsize=11pt',
            '--variable', 'papersize=a4',
            '--variable', 'documentclass=article'
        ].join(' ');

        console.log(`\n🔄 Converting: ${inputFile} -> ${outputFile}`);
        console.log(`📝 Language: ${language}`);
        
        execSync(pandocCmd, { encoding: 'utf8' });
        
        // Check if file was created and get size
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`✅ Created: ${outputFile} (${sizeMB} MB)`);
            return true;
        } else {
            console.log(`❌ Failed to create: ${outputFile}`);
            return false;
        }
        
    } catch (error) {
        console.log(`❌ Error converting ${inputFile}:`);
        console.log(error.message);
        
        // Try alternative method with wkhtmltopdf
        console.log("🔄 Trying alternative method...");
        return convertWithWKHtmlToPdf(inputPath, outputPath, language);
    }
}

// Alternative conversion method using wkhtmltopdf
function convertWithWKHtmlToPdf(inputPath, outputPath, language) {
    try {
        // First convert MD to HTML
        const htmlPath = outputPath.replace('.pdf', '.html');
        const cssPath = createPDFStyles();
        
        const htmlCmd = [
            'pandoc',
            `"${inputPath}"`,
            '-o', `"${htmlPath}"`,
            '--from', 'markdown',
            '--to', 'html',
            '--standalone',
            '--toc',
            `--css="${cssPath}"`,
            `--metadata title="Khipu Studio User Guide"`
        ].join(' ');
        
        execSync(htmlCmd, { encoding: 'utf8' });
        
        // Then convert HTML to PDF with wkhtmltopdf
        const pdfCmd = [
            'wkhtmltopdf',
            '--page-size', 'A4',
            '--margin-top', '25mm',
            '--margin-bottom', '25mm', 
            '--margin-left', '25mm',
            '--margin-right', '25mm',
            '--enable-local-file-access',
            `"${htmlPath}"`,
            `"${outputPath}"`
        ].join(' ');
        
        execSync(pdfCmd, { encoding: 'utf8' });
        
        // Clean up HTML file
        fs.unlinkSync(htmlPath);
        
        console.log(`✅ Created with alternative method: ${path.basename(outputPath)}`);
        return true;
        
    } catch (error) {
        console.log(`❌ Alternative method also failed: ${error.message}`);
        return false;
    }
}

// Main conversion process
async function convertAllFiles() {
    console.log("🚀 Starting PDF conversion process...\n");
    
    // Setup
    ensureOutputDir();
    
    if (!checkPandoc()) {
        console.log("❌ Cannot proceed without Pandoc. Exiting.");
        return;
    }
    
    let successCount = 0;
    let totalFiles = config.files.length;
    
    // Convert each file
    for (const file of config.files) {
        const success = convertToPDF(file.input, file.output, file.language);
        if (success) successCount++;
    }
    
    // Summary
    console.log(`\n📊 Conversion Summary:`);
    console.log(`✅ Successfully converted: ${successCount}/${totalFiles} files`);
    console.log(`📁 Output directory: ${path.resolve(config.outputDir)}`);
    
    if (successCount > 0) {
        console.log(`\n📄 Generated PDF files:`);
        config.files.forEach(file => {
            const outputPath = path.join(config.outputDir, file.output);
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
                console.log(`   - ${file.output} (${sizeMB} MB) - ${file.language}`);
            }
        });
    }
    
    if (successCount < totalFiles) {
        console.log(`\n⚠️  Some conversions failed. Check the error messages above.`);
        console.log(`💡 Make sure you have either WeasyPrint or wkhtmltopdf installed:`);
        console.log(`   - WeasyPrint: pip install weasyprint`);
        console.log(`   - wkhtmltopdf: choco install wkhtmltopdf`);
    }
}

// Run the conversion
convertAllFiles().catch(error => {
    console.error("❌ Conversion process failed:", error);
    process.exit(1);
});