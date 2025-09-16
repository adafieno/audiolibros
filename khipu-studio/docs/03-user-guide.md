# Khipu Studio - User Guide

## Getting Started

Khipu Studio is a comprehensive audiobook production application that transforms your written manuscript into professional-quality audiobooks using AI-powered tools and advanced text-to-speech technology.

### System Requirements

- **Operating System:** Windows 10/11, macOS 10.15+, or Linux
- **Memory:** 8GB RAM minimum (16GB recommended)
- **Storage:** 500MB for application + additional space for projects
- **Internet Connection:** Required for TTS services and AI features

### First Launch

1. **Install Khipu Studio** from the provided installer
2. **Launch the application** - you'll see the Home screen
3. **Create your first project** or open an existing one

---

## Quick Start Workflow

### 1. Create a New Project

**From the Home screen:**
1. Click **"Create New Project"**
2. Choose a **parent directory** (e.g., `C:\audiobook-projects`)
3. Enter your **project name** (e.g., "my-first-audiobook")
4. Click **"Create Project"**

The application will create a structured project folder with all necessary directories and configuration files.

### 2. Configure Your Book

**Navigate to the Book tab:**
1. Enter your **book title** and **subtitle**
2. Add **author names** (you can add multiple authors)
3. Select the **primary language** for your audiobook
4. Upload a **cover image** (optional but recommended)
5. Add additional metadata like **description** and **keywords**

### 3. Import Your Manuscript

**Go to the Manuscript tab:**
1. **Import chapter files** by clicking "Import Chapters" or dragging files
2. **Review the chapter list** - ensure chapters are in the correct order
3. **Edit text if needed** using the built-in editor
4. **Mark manuscript as complete** when ready

### 4. Set Up Characters (Dossier)

**In the Dossier tab:**
1. **Add characters** who speak in your book
2. **Define the narrator** (usually the main voice)
3. **Describe each character** to help with voice assignment
4. **Set voice preferences** for consistent casting

### 5. Choose Voices (Casting)

**Navigate to Casting:**
1. **Review detected characters** from your dossier
2. **Assign voices** to each character
3. **Audition voices** by playing sample audio
4. **Adjust voice settings** (speaking rate, pitch, style)

### 6. Generate Audio Plan

**Go to the Planning tab:**
1. **Select a chapter** from the dropdown
2. Click **"Generate Plan for [Chapter]"**
3. **Review the generated segments** - the AI will detect speakers
4. **Lock segments** you're happy with
5. **Adjust voice assignments** if needed
6. **Repeat for all chapters**

### 7. Produce Audio

**Switch to the Voice tab:**
1. **Select a chapter** to work on
2. **Review audio segments** in the table
3. **Generate audio** for individual segments or entire chapters
4. **Apply audio processing** (noise reduction, EQ, etc.)
5. **Mark revisions** for segments that need improvement
6. **Preview audio** with the built-in player

### 8. Monitor Costs and Usage

**Go to the Cost tab:**
1. **Review TTS usage** and associated costs
2. **Track processing time** for different operations
3. **Set budgets and alerts** to control spending
4. **Analyze efficiency** - see where time and money are spent
5. **Monitor cache effectiveness** - track savings from reused audio

### 9. Export Your Audiobook

**Go to the Packaging tab:**
1. **Choose export format** (M4B for iTunes/Apple Books, ZIP for Google Play)
2. **Configure chapter titles** and metadata
3. **Set audio quality settings**
4. **Generate the final audiobook package**

---

## Key Concepts

### Project Structure

Every Khipu Studio project follows a standardized structure:

```
your-project/
├── analysis/chapters_txt/    # Your editable chapter text files
├── art/                      # Cover images and artwork
├── audio/                    # Generated audio files
├── dossier/                  # Character and world information
├── ssml/                     # Generated SSML (Speech Synthesis Markup)
└── [config files]           # Project settings and metadata
```

### Workflow Stages

Khipu Studio follows a **cascading workflow** where each stage unlocks the next:

1. **Project Setup** → Create and configure project
2. **Manuscript** → Import and organize your text
3. **Pre-production** → Characters (Dossier), Voice Casting, Planning
4. **Production** → Audio generation and processing
5. **Post-production** → Export and packaging

### The Planning System

The **Planning** feature is central to Khipu Studio:

- **AI Analysis:** Automatically detects speakers and segments text
- **Segments:** Small chunks of text optimized for TTS processing
- **Voice Mapping:** Each segment is assigned to a character's voice
- **Locking:** Prevent segments from being changed during regeneration

### Audio Processing

Khipu Studio applies professional audio processing:

- **Noise Reduction:** Removes background noise and artifacts
- **Equalization:** Balances frequency response
- **Compression:** Controls dynamic range for consistent volume
- **Mastering:** Final polish for professional sound quality

---

## Navigation Guide

### Left Sidebar Menu

The navigation menu shows available features based on your progress:

- **🏠 Home** - Project selection and creation
- **📖 Book** - Book metadata and configuration  
- **📑 Manuscript** - Chapter management and editing
- **👥 Dossier** - Character profiles and descriptions
- **🎭 Casting** - Voice assignment to characters
- **📋 Planning** - AI-powered content segmentation
- **🎤 Voice** - Audio production and processing
- **� Cost** - Usage tracking and cost management
- **�📦 Packaging** - Export and final assembly
- **⚙️ Settings** - Application and project preferences

### Status Indicators

- **✅ Green** - Complete and ready
- **🟡 Yellow** - In progress or needs attention
- **⚪ Gray** - Not started or not available yet

---

## Tips for Success

### 1. Manuscript Preparation
- **Clean text formatting** - Remove extra spaces and formatting
- **Consistent dialogue format** - Use standard quotation marks
- **Chapter organization** - One file per chapter for best results

### 2. Character Setup
- **Be specific** - Detailed character descriptions improve AI detection
- **Define the narrator** - Usually your primary voice
- **Consider distinctiveness** - Choose voices that are clearly different

### 3. Voice Selection
- **Audition thoroughly** - Test voices with actual text from your book
- **Consider the genre** - Match voice style to your book's tone
- **Think about fatigue** - Some voices work better for long-form content

### 4. Planning Review
- **Check AI suggestions** - The AI is good but not perfect
- **Lock good segments** - Prevent changes to segments you approve
- **Adjust segment length** - Very long segments may hit TTS limits

### 5. Audio Production
- **Process systematically** - Work chapter by chapter
- **Use revision marking** - Mark segments that need improvement
- **Apply processing consistently** - Use similar settings across chapters

### 6. Quality Control
- **Listen to samples** - Don't skip the preview step
- **Check transitions** - Ensure smooth flow between segments
- **Validate metadata** - Ensure chapter titles and info are correct

### 7. Cost Management
- **Monitor usage regularly** - Check the Cost tab frequently
- **Set realistic budgets** - Use alerts to avoid overruns
- **Leverage caching** - Reuse audio when possible to save costs
- **Review TTS efficiency** - Optimize segments to reduce unnecessary generation
- **Track project costs** - Keep detailed records for business planning

---

## Troubleshooting

### Common Issues

**"Failed to generate plan"**
- Check internet connection (requires AI services)
- Verify API credentials in Settings
- Ensure chapter text is not empty

**"TTS generation failed"**
- Check Azure TTS credentials
- Verify voice is available for your language
- Try reducing segment length

**"No audio playback"**
- Check system audio settings
- Verify audio files were generated successfully
- Try restarting the application

**"Export failed"**
- Ensure all chapters have audio generated
- Check available disk space
- Verify export format settings

### Getting Help

1. **Check the logs** - Look for error messages in the application
2. **Verify configuration** - Ensure API keys and settings are correct
3. **Try smaller tests** - Test with a single chapter or segment
4. **Restart if needed** - Sometimes a fresh start helps

---

## Advanced Features

### Custom Processing Chains
- Fine-tune audio processing for different voices
- Save presets for consistent application
- A/B test different settings

### Sound Effects
- Insert custom sound effects at specific points
- Control timing and volume precisely
- Build a library of reusable effects

### Batch Operations
- Process multiple chapters simultaneously
- Apply settings across multiple segments
- Bulk revision marking and processing

### Cost Tracking
- Monitor TTS usage and costs
- Set budgets and alerts
- Optimize for cost-effectiveness

---

*This guide covers the essential workflow for creating audiobooks with Khipu Studio. For detailed feature-specific instructions, see the individual Feature Guides.*