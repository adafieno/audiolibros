# Khipu Studio Icons

Professional icon package for Khipu Studio audiobook creation platform.

## 🎨 Design Concept

The icon features three vertical cords with colorful knots at different positions, inspired by the ancient Andean **khipu** (quipu) - a sophisticated recording device using knotted strings. 

This design represents:
- **Data recording** through knotted strings (like audio chapters/markers)
- **Storytelling tradition** connecting ancient and modern methods
- **Precision and craftsmanship** in audiobook creation
- **Unique cultural heritage** making the brand memorable
- **Diversity** through varied knot colors representing different types of content

## 📦 Package Contents

### Windows
- **khipu_studio.ico** - Multi-resolution ICO file (16x16 to 256x256)
  - Use for: Windows installers, executable files, shortcuts

### macOS
- **khipu_studio.icns** - Apple Icon Image format
- **khipu_studio.iconset/** - Directory with all required macOS sizes
  - Use for: macOS app bundles, DMG installers

### Linux
- **khipu_studio_512.png** - High resolution (512x512)
- **khipu_studio_256.png** - Medium resolution (256x256)
- **khipu_studio_128.png** - Standard resolution (128x128)
  - Use for: .deb, .rpm packages, desktop files

### Scalable
- **khipu_studio.svg** - Vector format for any size
  - Use for: Web, print, marketing materials

### Individual PNG Files
- All sizes from 16x16 to 1024x1024 available as individual PNG files

## 🎨 Exact Color Specifications

**Background:**
- Soft cream: #F5F0E6

**Cords:** (all three cords use the same color)
- Dark olive: **#6F550A**

**Knots:** (repeating pattern across the three cords)
- **First knot:** Rust/Terracotta - **#C85225**
- **Second knot:** Light Beige - **#DFCCA0**
- **Third knot:** Dark Teal/Blue - **#0B3041**

**Knot Distribution:**
- Left cord: Rust (#C85225) at 25%, Beige (#DFCCA0) at 55%
- Middle cord: Teal (#0B3041) at 35%, Rust (#C85225) at 70%
- Right cord: Beige (#DFCCA0) at 45%, Teal (#0B3041) at 65%

## 🎯 Design Specifications

**Structure:**
- Three vertical dark olive cords
- Six colorful knots in three distinct colors
- Clean, minimal design
- Soft cream background

**Features:**
- Strong color contrast for visibility
- Distinctive color palette combining warm and cool tones
- Professional appearance with cultural authenticity
- Scales perfectly from 16x16 to 1024x1024

## 🛠️ Usage Instructions

### Windows Installer (NSIS/Inno Setup)
```nsis
Icon "khipu_studio.ico"
```

### macOS App Bundle
1. Copy `khipu_studio.icns` to `YourApp.app/Contents/Resources/`
2. In `Info.plist`, add:
```xml
<key>CFBundleIconFile</key>
<string>khipu_studio</string>
```

### Electron Apps
```javascript
// In electron-builder config
"win": {
  "icon": "build/icons/khipu_studio.ico"
},
"mac": {
  "icon": "build/icons/khipu_studio.icns"
},
"linux": {
  "icon": "build/icons/"
}
```

### Linux .desktop File
```ini
[Desktop Entry]
Name=Khipu Studio
Icon=khipu_studio
# Copy khipu_studio_128.png to /usr/share/icons/hicolor/128x128/apps/
```

### Web/Marketing
Use PNG or SVG files:
- Favicon: `icon_32x32.png` or `icon_16x16.png`
- Social media: `khipu_studio_512.png`
- Responsive web: `khipu_studio.svg`
- Documentation: `khipu_studio_256.png`

## ✅ Quality Checklist

- ✓ Windows: Multi-resolution ICO with 6 sizes
- ✓ macOS: ICNS with retina display support
- ✓ Linux: PNG files in standard sizes
- ✓ Scalable: SVG for unlimited sizing
- ✓ Exact brand colors implemented
- ✓ High contrast for visibility
- ✓ Clear visibility from 16x16 to 1024x1024
- ✓ Unique and memorable design

## 📖 About Khipu

A khipu (also spelled quipu, from Quechua for "knot") was a method used by the Incas and other ancient Andean cultures to record information through knotted strings. Different knot types, positions, and colors represented different types of data - numbers, narrative information, and accounts. This makes it a perfect metaphor for an audiobook creation platform that records and preserves spoken stories.

## 🎯 Design Features

- **Asymmetric knot placement** creates unique recognition
- **Three distinct knot colors** (rust, beige, teal) for visual interest
- **Dark olive cords** provide consistent structure
- **Vertical orientation** represents progression through content
- **Clean, modern execution** bridges ancient and contemporary design
- **Strong color palette** combining warm rust/beige with cool teal

## 💡 Brand Storytelling

The khipu icon tells a story:
- Ancient recording technology meets modern audiobook creation
- Each knot represents a chapter, section, or audio marker
- Three distinct colors symbolize varied content types
- The vertical structure suggests progression through a story
- Traditional craftsmanship meets digital innovation
- Unique color combination creates memorable brand identity

---

**Khipu Studio** - Weaving Stories into Sound
