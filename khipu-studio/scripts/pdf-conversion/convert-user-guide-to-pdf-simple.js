const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

console.log("📄 Khipu Studio - Markdown to PDF Converter (Puppeteer)");
console.log("====================================================");

const config = {
    inputDir: 'docs',
    outputDir: 'docs/pdf',
    files: [
        { input: '03-user-guide.md', output: 'Khipu-Studio-User-Guide-EN.pdf', language: 'English', title: 'Khipu Studio - User Guide' },
        { input: '03-user-guide-es-PE.md', output: 'Khipu-Studio-Guia-Usuario-ES.pdf', language: 'Español (Perú)', title: 'Khipu Studio - Guía del Usuario' },
        { input: '03-user-guide-pt-BR.md', output: 'Khipu-Studio-Guia-Usuario-PT.pdf', language: 'Português (Brasil)', title: 'Khipu Studio - Guia do Usuário' }
    ]
};

// CSS styles for PDF
const pdfStyles = `
<style>
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

h1 {
    color: #2c5aa0;
    font-size: 24pt;
    border-bottom: 3px solid #2c5aa0;
    padding-bottom: 10px;
    margin-top: 0;
    page-break-after: avoid;
    page-break-inside: avoid;
    orphans: 3;
    widows: 3;
}

h2 {
    color: #2c5aa0;
    font-size: 18pt;
    margin-top: 30px;
    margin-bottom: 15px;
    page-break-after: avoid;
    page-break-inside: avoid;
    orphans: 3;
    widows: 3;
}

h3 {
    color: #444;
    font-size: 14pt;
    margin-top: 25px;
    margin-bottom: 10px;
    page-break-after: avoid;
    page-break-inside: avoid;
    orphans: 2;
    widows: 2;
}

h4 {
    color: #666;
    font-size: 12pt;
    margin-top: 20px;
    margin-bottom: 8px;
    page-break-after: avoid;
    page-break-inside: avoid;
    orphans: 2;
    widows: 2;
}

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

strong {
    color: #2c5aa0;
    font-weight: 600;
}

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

img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border: 1px solid #ddd;
    border-radius: 5px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    page-break-inside: avoid;
    page-break-before: auto;
    page-break-after: auto;
}

blockquote {
    border-left: 4px solid #2c5aa0;
    margin: 20px 0;
    padding-left: 20px;
    font-style: italic;
    color: #666;
}

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

/* Step sections styling */
h3:contains("Paso"), h3:contains("Passo"), h3:contains("Step") {
    background-color: #f0f4f8;
    padding: 10px;
    border-left: 4px solid #2c5aa0;
    border-radius: 0 5px 5px 0;
}

/* Additional page-break improvements */
ul, ol {
    page-break-inside: auto;
    orphans: 2;
    widows: 2;
}

li {
    page-break-inside: avoid;
}

/* Prevent short paragraphs from being orphaned */
p {
    orphans: 2;
    widows: 2;
}

/* Tables should not break across pages if possible */
table {
    page-break-inside: auto;
    page-break-before: auto;
    page-break-after: auto;
}

/* Ensure code blocks stay together */
pre, code {
    page-break-inside: avoid;
}

/* Keep blockquotes together */
blockquote {
    page-break-inside: avoid;
    page-break-before: auto;
    page-break-after: auto;
}
</style>
`;

// Ensure output directory exists and set up image directories
function ensureOutputDir() {
    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
        console.log(`📁 Created output directory: ${config.outputDir}`);
    }
    
    // Set up language-specific image directories
    setupImageDirectories();
}

// Set up image directories and copy screenshots
function setupImageDirectories() {
    const baseImageDir = path.join(config.inputDir, 'images', 'user-guide');
    const sourceImageDir = path.join(baseImageDir); // Base directory with numbered screenshots
    
    // Language mappings
    const languageDirs = ['en-US', 'es-PE', 'pt-BR'];
    
    languageDirs.forEach(langDir => {
        const targetDir = path.join(baseImageDir, langDir);
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`📁 Created image directory: ${targetDir}`);
        }
        
        // Copy numbered screenshots to language directories if they don't exist
        const sourceFiles = fs.readdirSync(sourceImageDir, { withFileTypes: true })
            .filter(dirent => dirent.isFile() && dirent.name.match(/^\d+-.*\.png$/))
            .map(dirent => dirent.name);
        
        sourceFiles.forEach(fileName => {
            const sourcePath = path.join(sourceImageDir, fileName);
            const targetPath = path.join(targetDir, fileName);
            
            if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
                try {
                    fs.copyFileSync(sourcePath, targetPath);
                    console.log(`📷 Copied: ${fileName} -> ${langDir}/`);
                } catch (error) {
                    console.log(`⚠️  Could not copy ${fileName}: ${error.message}`);
                }
            }
        });
    });
}

// Convert markdown file to HTML with proper image paths
function convertMarkdownToHtml(markdownContent, title) {
    // Configure marked to handle images properly
    const renderer = new marked.Renderer();
    
    // Override image rendering to use base64 data URLs
    renderer.image = function(href, title, text) {
        // Handle different types of href (string or token object)
        let imageHref = href;
        if (typeof href === 'object' && href !== null) {
            // If href is a token object, extract the href property
            imageHref = href.href || href.src || href.url;
        }
        
        // Handle null, undefined or invalid href
        if (!imageHref || typeof imageHref !== 'string') {
            console.log(`⚠️  Invalid image href: ${JSON.stringify(href)}`);
            return `<div style="border: 2px dashed #ccc; background-color: #f9f9f9; padding: 20px; text-align: center; min-height: 200px; margin: 20px auto; border-radius: 5px; color: #666; font-size: 14pt;">📷 Invalid image reference</div>`;
        }
        
        // Convert relative image paths to base64 data URLs
        let imageSrc = imageHref;
        let imageExists = false;
        
        if (imageHref.startsWith('images/')) {
            // Convert relative path to absolute path from docs directory
            const absolutePath = path.resolve(config.inputDir, imageHref);
            imageExists = fs.existsSync(absolutePath);
            
            if (imageExists) {
                try {
                    // Read the image file and convert to base64
                    const imageBuffer = fs.readFileSync(absolutePath);
                    const imageExt = path.extname(absolutePath).toLowerCase();
                    let mimeType = 'image/png';
                    
                    if (imageExt === '.jpg' || imageExt === '.jpeg') {
                        mimeType = 'image/jpeg';
                    } else if (imageExt === '.gif') {
                        mimeType = 'image/gif';
                    } else if (imageExt === '.webp') {
                        mimeType = 'image/webp';
                    }
                    
                    const base64Data = imageBuffer.toString('base64');
                    imageSrc = `data:${mimeType};base64,${base64Data}`;
                    console.log(`✅ Embedded image: ${imageHref} (${(imageBuffer.length / 1024).toFixed(1)}KB)`);
                } catch (error) {
                    console.log(`❌ Error reading image ${absolutePath}: ${error.message}`);
                    imageExists = false;
                }
            } else {
                console.log(`⚠️  Image not found: ${absolutePath}`);
            }
        }
        
        let titleAttr = title ? ` title="${title}"` : '';
        let altAttr = text ? ` alt="${text}"` : '';
        
        if (!imageExists) {
            // Create placeholder div for missing images
            return `<div style="border: 2px dashed #ccc; background-color: #f9f9f9; padding: 20px; text-align: center; min-height: 200px; margin: 20px auto; border-radius: 5px; color: #666; font-size: 14pt;">📷 ${text || 'Missing image'}</div>`;
        }
        
        return `<img src="${imageSrc}"${altAttr}${titleAttr} style="max-width: 100%; height: auto; margin: 20px auto; display: block; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />`;
    };
    
    // Set the custom renderer
    marked.setOptions({ renderer });
    
    const htmlContent = marked(markdownContent);
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${pdfStyles}
</head>
<body>
    ${htmlContent}
</body>
</html>
`;
}

// Convert HTML to PDF using Puppeteer
async function convertHtmlToPdf(htmlContent, outputPath, title) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // Set content
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        // Generate PDF
        await page.pdf({
            path: outputPath,
            format: 'A4',
            margin: {
                top: '2.5cm',
                right: '2.5cm',
                bottom: '2.5cm',
                left: '2.5cm'
            },
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `
                <div style="font-size: 9pt; color: #666; text-align: center; width: 100%; padding-top: 10px; border-top: 1px solid #ddd;">
                    <span>${title} - Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
                </div>
            `,
            // Better page break handling
            preferCSSPageSize: false,
            omitBackground: false,
            tagged: false
        });
        
        console.log(`✅ Created: ${path.basename(outputPath)}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error creating PDF: ${error.message}`);
        return false;
    } finally {
        await browser.close();
    }
}

// Convert a single markdown file to PDF
async function convertFile(fileConfig) {
    const inputPath = path.join(config.inputDir, fileConfig.input);
    const outputPath = path.join(config.outputDir, fileConfig.output);
    
    if (!fs.existsSync(inputPath)) {
        console.log(`❌ Input file not found: ${inputPath}`);
        return false;
    }
    
    try {
        console.log(`\\n🔄 Converting: ${fileConfig.input} -> ${fileConfig.output}`);
        console.log(`📝 Language: ${fileConfig.language}`);
        
        // Read markdown content
        const markdownContent = fs.readFileSync(inputPath, 'utf8');
        
        // Convert to HTML
        const htmlContent = convertMarkdownToHtml(markdownContent, fileConfig.title);
        
        // Convert to PDF
        const success = await convertHtmlToPdf(htmlContent, outputPath, fileConfig.title);
        
        if (success && fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`📊 Size: ${sizeMB} MB`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error(`❌ Error processing ${fileConfig.input}: ${error.message}`);
        return false;
    }
}

// Main conversion process
async function convertAllFiles() {
    console.log("🚀 Starting PDF conversion process...\\n");
    
    // Setup
    ensureOutputDir();
    
    let successCount = 0;
    const totalFiles = config.files.length;
    
    // Convert each file
    for (const fileConfig of config.files) {
        const success = await convertFile(fileConfig);
        if (success) successCount++;
    }
    
    // Summary
    console.log(`\\n📊 Conversion Summary:`);
    console.log(`✅ Successfully converted: ${successCount}/${totalFiles} files`);
    console.log(`📁 Output directory: ${path.resolve(config.outputDir)}`);
    
    if (successCount > 0) {
        console.log(`\\n📄 Generated PDF files:`);
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
        console.log(`\\n⚠️  Some conversions failed. Check the error messages above.`);
    } else {
        console.log(`\\n🎉 All files converted successfully!`);
    }
}

// Check if required packages are installed
function checkDependencies() {
    const requiredPackages = ['puppeteer', 'marked'];
    const missingPackages = [];
    
    for (const pkg of requiredPackages) {
        try {
            require.resolve(pkg);
        } catch (error) {
            missingPackages.push(pkg);
        }
    }
    
    if (missingPackages.length > 0) {
        console.log(`❌ Missing required packages: ${missingPackages.join(', ')}`);
        console.log(`💡 Install them with: npm install ${missingPackages.join(' ')}`);
        return false;
    }
    
    return true;
}

// Run the conversion
if (checkDependencies()) {
    convertAllFiles().catch(error => {
        console.error("❌ Conversion process failed:", error);
        process.exit(1);
    });
}