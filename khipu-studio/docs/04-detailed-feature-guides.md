# Khipu Studio - Detailed Feature Guides

This document provides comprehensive, step-by-step instructions for each feature in Khipu Studio.

---

## 1. Project Management

### Creating a New Project

**Step-by-step process:**

1. **Start from Home Screen**
   - Launch Khipu Studio
   - You'll see the Home screen with recent projects

2. **Click "Create New Project"**
   - A dialog box will appear

3. **Set Parent Directory**
   - Click the folder icon or type path
   - Example: `C:\audiobook-projects` or `/Users/yourname/audiobooks`
   - This is where your project folder will be created

4. **Enter Project Name**
   - Use a descriptive name without special characters
   - Example: "mystery-novel-2024" or "childrens-story"

5. **Click "Create Project"**
   - Khipu Studio will:
     - Create the project folder
     - Set up the directory structure
     - Generate configuration files
     - Initialize voice inventory
     - Open the new project

### Opening Existing Projects

**From Recent Projects:**
1. **Home Screen** shows recent projects with covers
2. **Click any project** to open it instantly
3. **Project info** shows title, authors, and language

**From File System:**
1. **Click "Open Existing Project"**
2. **Navigate to project folder**
3. **Select the project folder** (not individual files)
4. **Click "Open"**

### Project Status Understanding

**Project Card Elements:**
- **Cover Image** - Book cover art (if available)
- **Title & Authors** - Book metadata
- **Project Name** - Folder name
- **Language** - Primary language setting
- **Status Indicators** - Visual progress cues

---

## 2. Book Configuration

### Setting Up Book Metadata

**Access:** Navigate to **Book** tab in left sidebar

**Basic Information:**
1. **Book Title**
   - Enter main title of your book
   - This appears in audiobook metadata

2. **Subtitle** (optional)
   - Additional descriptive text
   - Appears after the main title

3. **Authors**
   - Click "Add Author" for each author
   - Enter full names as they should appear
   - Use "Remove" to delete incorrect entries

4. **Language**
   - Select primary language from dropdown
   - This affects voice selection and TTS settings
   - Cannot be changed easily after setup

**Advanced Metadata:**
5. **Description**
   - Brief book summary
   - Used in audiobook metadata
   - Keep concise but descriptive

6. **Keywords**
   - Comma-separated tags
   - Help with categorization
   - Example: "mystery, thriller, detective"

7. **ISBN** (optional)
   - 10 or 13 digit ISBN
   - Used in professional distribution

8. **Publisher** (optional)
   - Publishing company name
   - Your name if self-published

### Cover Image Management

**Uploading Cover:**
1. **Click "Choose Cover Image"**
2. **Select image file** (JPG, PNG recommended)
3. **Image will be validated** for size and format
4. **Preview appears** immediately

**Cover Requirements:**
- **Format:** JPG or PNG
- **Size:** Minimum 1400x1400 pixels (square aspect ratio preferred)
- **Quality:** High resolution for best results
- **File Size:** Under 10MB

**Cover Management:**
- **Replace:** Upload new image to replace current
- **Remove:** Delete current cover (reverts to default)
- **Preview:** Full-size preview available

---

## 3. Manuscript Management

### Importing Chapters

**Access:** Navigate to **Manuscript** tab

**Import Methods:**

**Method 1: File Import**
1. **Click "Import Chapters"**
2. **Select one or more text files**
3. **Files are copied** to `analysis/chapters_txt/`
4. **Review imported chapters** in the list

**Method 2: Drag & Drop**
1. **Drag text files** from file explorer
2. **Drop onto the manuscript area**
3. **Files are automatically imported**

**Supported Formats:**
- Plain text (.txt)
- Rich text (.rtf)
- Word documents (.docx) - text only
- Markdown (.md)

### Chapter Organization

**Chapter List View:**
- **File Name** - Original filename
- **Status** - Text availability and length
- **Actions** - Edit, rename, delete options

**Reordering Chapters:**
1. **Drag chapter entries** up or down
2. **Order affects** final audiobook sequence
3. **Changes save automatically**

**Chapter Actions:**
- **Edit** - Open in-app text editor
- **Rename** - Change chapter filename
- **Delete** - Remove chapter (confirmation required)
- **External Edit** - Open in system text editor

### Text Editing

**Built-in Editor:**
1. **Click "Edit"** on any chapter
2. **Text editor opens** with current content
3. **Make changes** as needed
4. **Save** to update the file
5. **Close** to return to chapter list

**Editor Features:**
- **Syntax highlighting** for improved readability
- **Line numbers** for reference
- **Find and replace** functionality
- **Auto-save** prevents data loss

**External Editing:**
1. **Click "Edit Externally"**
2. **Chapter opens** in your default text editor
3. **Edit and save** in external application
4. **Return to Khipu Studio** - changes are detected automatically

### Chapter Validation

**Automatic Checks:**
- **File exists** and is readable
- **Contains text** (not empty)
- **Encoding** is valid UTF-8
- **Length** is appropriate for TTS

**Status Indicators:**
- **✅ Green:** Chapter ready for processing
- **⚠️ Yellow:** Warnings or recommendations
- **❌ Red:** Errors that must be fixed

---

## 4. Character Management (Dossier)

### Creating Character Profiles

**Access:** Navigate to **Dossier** tab

**Adding Characters:**
1. **Click "Add Character"**
2. **Enter character name**
3. **Add description** (helps AI detection)
4. **Set character type** (narrator, character, etc.)
5. **Save character**

**Character Information:**

**Name Field:**
- Use the name as it appears in dialogue
- Be consistent with manuscript usage
- Examples: "Detective Smith", "Sarah", "The Old Man"

**Description Field:**
- Describe voice characteristics
- Include age, personality traits
- Example: "Young woman, cheerful and energetic"
- Example: "Gruff old detective, world-weary"

**Character Types:**
- **Narrator** - Primary storytelling voice
- **Character** - Individual speaking characters
- **Multiple** - Character who represents multiple voices

### Narrator Setup

**Identifying the Narrator:**
1. **Select primary narrator** from character list
2. **Mark as "Primary Narrator"**
3. **This voice will be used** for non-dialogue text
4. **Should be your most important voice**

**Multiple Narrators:**
- Some books have multiple narrators
- Mark each as "Narrator" type
- Assign different sections if needed

### Voice Assignment Preparation

**Best Practices:**
- **Be specific** in descriptions
- **Consider voice distinctiveness** 
- **Think about the genre** and tone
- **Plan for long listening** sessions

**Character Relationships:**
- Note relationships between characters
- Consider voice similarity/contrast
- Group similar characters if needed

---

## 5. Voice Casting

### Understanding Voice Selection

**Access:** Navigate to **Casting** tab

**Voice Inventory:**
The application includes hundreds of high-quality voices from Azure Cognitive Services, organized by:
- **Language** and locale
- **Gender** and age characteristics
- **Voice quality** and style options
- **Specialty voices** for different genres

### Assigning Voices to Characters

**Character List View:**
- Shows all characters from Dossier
- Current voice assignment (if any)
- Voice audition controls

**Assigning a Voice:**
1. **Select character** from the list
2. **Click "Choose Voice"**
3. **Browse available voices** filtered by language
4. **Click voice name** to see details
5. **Click "Audition"** to hear sample
6. **Click "Assign"** to set for character

### Voice Audition System

**Audition Process:**
1. **Select a voice** from the list
2. **Click "Audition"** or play button
3. **Listen to sample** with your text
4. **Adjust parameters** if needed
5. **Compare with other options**

**Audition Features:**
- **Sample text** uses appropriate language
- **Real-time generation** with your settings
- **Volume control** for comfort
- **A/B comparison** between voices

**Custom Audition Text:**
1. **Enter your own text** in audition box
2. **Use representative dialogue** from your book
3. **Test different moods** and contexts
4. **Save preferred text** for consistency

### Voice Parameter Tuning

**Speaking Rate:**
- **Slower (0.8x)** - More deliberate, clearer
- **Normal (1.0x)** - Standard speaking pace
- **Faster (1.2x)** - More energetic, urgent

**Pitch Adjustment:**
- **Lower (-10%)** - Deeper, more serious
- **Normal (0%)** - Natural pitch
- **Higher (+10%)** - Younger, more excited

**Voice Style:** (Available for select voices)
- **Neutral** - Standard delivery
- **Cheerful** - Upbeat and positive
- **Sad** - Somber and melancholic
- **Angry** - Intense and forceful
- **Whispering** - Soft and intimate

**Style Degree:**
- **Subtle (0.5)** - Light application of style
- **Moderate (1.0)** - Standard style application
- **Strong (1.5)** - Emphasized style characteristics

### Voice Testing and Validation

**Validation Checklist:**
- **Audition each voice** with representative text
- **Test different emotions** and contexts
- **Ensure voice distinctiveness** between characters
- **Check for listening fatigue** over time
- **Validate language consistency**

**Voice Conflicts:**
The system will warn about:
- **Duplicate voice assignments**
- **Very similar voices** for different characters
- **Missing narrator assignment**
- **Unassigned characters**

---

## 6. Content Planning

### AI-Powered Plan Generation

**Access:** Navigate to **Planning** tab

**Prerequisites:**
- Manuscript chapters imported
- Characters defined in Dossier
- Voices assigned in Casting

**Generating Plans:**
1. **Select chapter** from dropdown
2. **Click "Generate Plan for [Chapter]"**
3. **AI analyzes the text** and creates segments
4. **Review generated plan** in the table
5. **Make adjustments** as needed

**AI Analysis Process:**
- **Text segmentation** into TTS-optimized chunks
- **Speaker detection** using character profiles
- **Voice assignment** based on casting decisions
- **Segment validation** for size and quality

### Plan Board Interface

**Table Columns:**
- **ID** - Segment identifier
- **Lock** - Prevents segment from changing
- **Text** - Segment content (read-only)
- **Voice** - Assigned character voice
- **Actions** - Edit, split, merge options

**Segment Operations:**

**Locking Segments:**
1. **Review segment** text and voice assignment
2. **Click lock icon** if satisfactory
3. **Locked segments** won't change during regeneration
4. **Unlock** to allow AI updates

**Voice Override:**
1. **Click voice name** in segment
2. **Select different character** from dropdown
3. **Change applies** immediately
4. **Can override** AI assignments

**Splitting Segments:**
1. **Select segment** to split
2. **Click "Split" action**
3. **Choose split position** in text
4. **Confirm split operation**
5. **Two new segments** are created

**Merging Segments:**
1. **Select first segment**
2. **Click "Merge with Next"**
3. **Segments combine** into one
4. **Voice assignment** follows first segment

### Plan Validation

**Automatic Validation:**
- **Segment size** limits for TTS
- **Voice assignment** consistency
- **Text quality** checks
- **Character detection** accuracy

**Validation Indicators:**
- **✅ Green:** Segment ready for production
- **⚠️ Yellow:** Warnings or recommendations
- **❌ Red:** Errors requiring attention

**Common Validation Issues:**
- **Segment too long** - Split into smaller pieces
- **No voice assigned** - Assign character voice
- **Unrecognized speaker** - Add to character list
- **Text formatting issues** - Clean up in manuscript

### Sound Effects Integration

**Adding SFX Markers:**
1. **Select segment** where effect should play
2. **Click "Add SFX" action**
3. **Choose audio file** from system
4. **Set timing** (before, after, or overlay)
5. **Adjust volume** relative to speech

**SFX Management:**
- **File validation** ensures compatible format
- **Duration display** shows effect length
- **Volume control** for proper mixing
- **Timing precision** for exact placement

---

## 7. Audio Production

### Audio Generation Process

**Access:** Navigate to **Voice** tab

**Prerequisites:**
- Plans generated for chapters
- All segments have voice assignments
- TTS service configured in Settings

**Chapter Selection:**
1. **Select chapter** from dropdown
2. **Review segment table** with audio status
3. **Check voice assignments** and text
4. **Proceed with generation**

### Individual Segment Processing

**Segment Table View:**
- **Segment ID** and display order
- **Text preview** (first 50 characters)
- **Voice assignment** 
- **Audio status** (generated, pending, error)
- **Actions** (generate, preview, mark revision)

**Generating Single Segment:**
1. **Select segment** in table
2. **Click "Generate Audio"** button
3. **Monitor progress** in status area
4. **Audio file created** in project folder
5. **Status updates** to show completion

**Batch Generation:**
1. **Click "Generate Chapter Audio"**
2. **All segments process** sequentially
3. **Progress indicator** shows completion
4. **Errors reported** for failed segments
5. **Can resume** after interruption

### Audio Processing Chains

**Understanding Processing:**
Audio processing enhances TTS output with professional techniques:
- **Noise Reduction** - Removes artifacts and background noise
- **Equalization** - Balances frequency response
- **Compression** - Controls dynamic range
- **Spatial Enhancement** - Adds depth and width
- **Mastering** - Final polish and loudness normalization

**Applying Processing:**
1. **Select segment** in table
2. **Processing controls appear** in right panel
3. **Adjust parameters** as desired
4. **Preview changes** in real-time
5. **Settings save automatically**

**Processing Parameters:**

**Noise Reduction:**
- **Enabled** - Toggle noise reduction on/off
- **Strength** - Amount of noise reduction (0-100%)
- **Sensitivity** - Detection threshold for noise

**Equalizer:**
- **Low Cut** - Remove very low frequencies
- **Low Boost/Cut** - Adjust bass response
- **Mid Boost/Cut** - Adjust midrange clarity
- **High Boost/Cut** - Adjust treble brightness
- **High Cut** - Remove very high frequencies

**Dynamics:**
- **Compressor Enabled** - Toggle compression
- **Threshold** - Level where compression starts
- **Ratio** - Amount of compression applied
- **Attack Time** - How quickly compression engages
- **Release Time** - How quickly compression releases

**Spatial Enhancement:**
- **Stereo Widening** - Increase stereo image width
- **Reverb** - Add natural room sound
- **Delay** - Create sense of space

**Mastering:**
- **Loudness Target** - Final output level (LUFS)
- **Peak Limiter** - Prevent digital clipping
- **Final EQ** - Last stage tonal adjustment

### Audio Preview and Review

**Preview Controls:**
- **Play/Pause** - Standard playback control
- **Waveform Display** - Visual representation of audio
- **Time Position** - Current playback position
- **Volume Control** - Preview volume adjustment

**Waveform Interaction:**
1. **Click anywhere** on waveform to jump to position
2. **Drag playhead** for precise positioning
3. **Visual feedback** shows processing effects
4. **Zoom controls** for detailed view

**A/B Comparison:**
1. **Toggle processing on/off** to compare
2. **Listen to before/after** versions
3. **Adjust parameters** while listening
4. **Save preferred settings**

### Revision Management

**Marking Revisions:**
1. **Listen to generated audio**
2. **Identify segments** needing improvement
3. **Click revision flag** on problematic segments
4. **Segments marked** for later attention

**Revision Workflow:**
- **Visual indicators** show revision status
- **Filter view** to show only revisions
- **Batch operations** for multiple segments
- **Progress tracking** for revision completion

**Common Revision Reasons:**
- **Mispronunciation** - Word not spoken correctly
- **Wrong emphasis** - Stress on wrong syllable
- **Pacing issues** - Too fast or slow
- **Voice mismatch** - Wrong character voice
- **Audio quality** - Processing artifacts

### Sound Effects Management

**Adding SFX to Timeline:**
1. **Select insertion point** in segment table
2. **Click "Insert Sound Effect"**
3. **Choose audio file** from system
4. **Validate file format** and duration
5. **Set placement** (before, after, overlay)

**SFX Properties:**
- **File Path** - Location of sound file
- **Duration** - Length of effect
- **Volume** - Relative to speech audio
- **Fade In/Out** - Smooth transitions
- **Timing Offset** - Precise positioning

**SFX Library Management:**
- **Import frequently used** effects
- **Organize by category** (ambience, action, etc.)
- **Preview before insertion**
- **Reuse across projects**

---

## 8. Quality Control

### Audio Review Process

**Systematic Review:**
1. **Work chapter by chapter**
2. **Listen to each segment** completely
3. **Note any issues** or needed improvements
4. **Mark revisions** as needed
5. **Re-process problematic segments**

**Review Checklist:**
- **Pronunciation accuracy** - All words spoken correctly
- **Character voice consistency** - Right voice for each character
- **Pacing appropriate** - Natural speaking rhythm
- **Audio quality** - No artifacts or distortion
- **Segment transitions** - Smooth flow between segments
- **Volume levels** - Consistent throughout

### Common Issues and Solutions

**Pronunciation Problems:**
- **Issue:** Word mispronounced
- **Solution:** Edit text with phonetic spelling or use SSML
- **Alternative:** Try different voice or TTS engine

**Voice Mismatch:**
- **Issue:** Wrong character voice assigned
- **Solution:** Change voice assignment in Planning
- **Prevention:** Careful casting and validation

**Pacing Issues:**
- **Issue:** Speech too fast or slow
- **Solution:** Adjust rate parameters in voice settings
- **Fine-tuning:** Use voice style adjustments

**Audio Quality:**
- **Issue:** Background noise or artifacts
- **Solution:** Increase noise reduction processing
- **Alternative:** Regenerate with different parameters

**Volume Inconsistency:**
- **Issue:** Some segments louder than others
- **Solution:** Apply consistent mastering settings
- **Prevention:** Use loudness normalization

### Batch Quality Operations

**Revision Management:**
- **Filter to revisions only** for focused review
- **Batch regenerate** all marked segments
- **Clear revision marks** when satisfied
- **Export revision reports** for tracking

**Processing Consistency:**
- **Apply same processing** to similar segments
- **Save processing presets** for reuse
- **Validate processing** across chapters
- **Maintain quality standards**

---

## 9. Export and Assembly

### Chapter Assembly

**Access:** Navigate to **Packaging** tab

**Prerequisites:**
- All chapter segments generated
- Quality review completed
- Processing applied consistently

**Assembly Process:**
1. **Select chapters** to assemble
2. **Configure assembly settings**
3. **Set gap duration** between segments
4. **Choose loudness normalization**
5. **Start assembly process**

**Assembly Settings:**

**Gap Control:**
- **Between segments** - Pause between speech segments
- **Between characters** - Longer pause for speaker changes
- **Chapter transitions** - Silence at chapter boundaries

**Loudness Normalization:**
- **Target level** - Final output loudness (e.g., -23 LUFS)
- **Peak limiting** - Prevent digital clipping
- **Dynamic range** - Maintain natural variation

**Quality Validation:**
- **Check for clipping** - No digital distortion
- **Verify continuity** - Smooth transitions
- **Test playback** - Sample listening check

### Export Format Configuration

**Supported Formats:**

**M4B (Apple Books/iTunes):**
- **High compatibility** with Apple ecosystem
- **Chapter marking** support
- **Metadata embedding**
- **Bookmarking capabilities**

**MP3 in ZIP (Google Play Books):**
- **Individual chapter files**
- **Metadata files included**
- **Platform-specific structure**
- **Validation included**

**WAV (Uncompressed):**
- **Highest quality** preservation
- **Large file sizes**
- **Professional archival**
- **Further processing ready**

**Export Configuration:**
1. **Choose target format**
2. **Set quality parameters**
3. **Configure chapter information**
4. **Add metadata fields**
5. **Specify output location**

### Metadata Configuration

**Required Metadata:**
- **Title** - From book configuration
- **Author(s)** - From book configuration
- **Narrator(s)** - From voice casting
- **Duration** - Calculated automatically
- **Genre** - User specified
- **Publication Date** - User specified

**Chapter Information:**
- **Chapter titles** - From manuscript
- **Chapter durations** - Calculated
- **Chapter markers** - For navigation
- **Section breaks** - If applicable

**Advanced Metadata:**
- **ISBN** - For professional distribution
- **Publisher** - From book configuration
- **Copyright** - User specified
- **Description** - From book configuration
- **Keywords** - For discovery

### Final Package Creation

**Package Assembly:**
1. **All files prepared** in temporary directory
2. **Metadata embedded** in audio files
3. **Package structure created** per format
4. **Validation performed** automatically
5. **Final package written** to output location

**Package Contents:**
- **Audio files** - Processed and assembled
- **Metadata files** - Platform-specific information
- **Cover image** - Embedded and separate
- **Chapter information** - Navigation data
- **Validation report** - Quality assurance

**Post-Export Validation:**
- **File integrity** - All files present and valid
- **Metadata accuracy** - Information correctly embedded
- **Playback testing** - Sample chapters play correctly
- **Platform compatibility** - Format meets requirements

### Distribution Preparation

**Platform-Specific Requirements:**

**Apple Books:**
- **M4B format** required
- **Cover art** minimum 1400x1400 pixels
- **Chapter markers** properly set
- **Metadata complete** and accurate

**Google Play Books:**
- **MP3 files** in ZIP package
- **Individual chapter files**
- **Metadata CSV** included
- **Cover image** separate file

**General Distribution:**
- **Quality validation** passed
- **Legal compliance** verified (copyright, etc.)
- **File naming** follows conventions
- **Archive backup** created

---

## 10. Settings and Configuration

### Global Application Settings

**Access:** Navigate to **Settings** tab

**API Credentials:**
1. **Azure TTS Setup**
   - Get API key from Azure Cognitive Services
   - Enter subscription key
   - Select service region
   - Test connection

2. **OpenAI Setup** (for AI planning)
   - Get API key from OpenAI
   - Enter API key
   - Select model (GPT-3.5 or GPT-4)
   - Test connection

**Default Preferences:**
- **Language** - Default for new projects
- **Voice Engine** - Preferred TTS service
- **Audio Quality** - Default processing level
- **Cache Settings** - Audio caching preferences

### Project-Specific Settings

**TTS Configuration:**
- **Engine Selection** - Azure, other services
- **Quality Settings** - Sample rate, bit depth
- **Voice Preferences** - Default voice selections
- **Processing Defaults** - Standard processing chain

**Audio Processing:**
- **Default Chain** - Standard processing settings
- **Quality Targets** - Loudness and dynamic range
- **Export Formats** - Preferred output formats
- **File Organization** - Folder structure preferences

### Troubleshooting Settings

**Diagnostic Tools:**
- **Connection Testing** - Verify API access
- **Cache Management** - Clear audio cache
- **Log Viewing** - Debug information
- **Performance Monitoring** - System resource usage

**Reset Options:**
- **Reset to Defaults** - Restore original settings
- **Clear Cache** - Remove temporary files
- **Regenerate Config** - Fix corrupted settings
- **Export/Import Settings** - Backup configuration

---

## Tips for Advanced Users

### Workflow Optimization
- **Use processing presets** for consistency
- **Batch operations** for efficiency
- **Keyboard shortcuts** for speed
- **Template projects** for similar work

### Quality Enhancement
- **Custom SSML** for pronunciation control
- **Voice blending** for natural transitions
- **Advanced processing** for professional sound
- **A/B testing** for optimal settings

### Project Management
- **Version control** for manuscripts
- **Backup strategies** for projects
- **Collaboration workflows** for teams
- **Archive management** for completed projects

---

*This guide provides comprehensive instructions for all Khipu Studio features. For additional support, refer to the troubleshooting sections or contact support.*