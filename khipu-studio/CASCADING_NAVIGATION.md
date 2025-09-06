# Cascading Navigation System

## Overview
The navigation system now implements a cascading workflow where navigation items become available as the user completes specific steps in their audiobook project.

## Workflow Steps

### Stage 1: Project Setup
**Available:** Home, Settings
**When project opens:** Project, Manuscript

### Stage 2: After Manuscript Completion
**Unlocks:** Dossier, Planning, Casting
**Requirements:** User marks manuscript as complete (chapters created)

### Stage 3: After Pre-production Completion  
**Unlocks:** SSML
**Requirements:** All three completed: Dossier, Planning, Casting

### Stage 4: After SSML Completion
**Unlocks:** Voice
**Requirements:** SSML marked as complete

### Stage 5: After Voice Completion
**Unlocks:** Export
**Requirements:** Voice work marked as complete

## Implementation Details

### Key Files Created/Modified:

1. **`store/project.ts`** - Extended with workflow state management
2. **`components/layout/AppShell.tsx`** - Updated navigation filtering
3. **`hooks/useWorkflow.ts`** - Hook for workflow management
4. **`components/WorkflowCompleteButton.tsx`** - Button component for marking steps complete
5. **`lib/workflow.ts`** - Persistence utilities

### Usage in Pages

To add workflow completion to a page:

```tsx
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";

// In your component render:
<WorkflowCompleteButton 
  step="manuscript" 
  disabled={!hasContent}
>
  Mark Manuscript Complete
</WorkflowCompleteButton>
```

### Available Workflow Steps:
- `"project"` - Project configuration
- `"manuscript"` - Manuscript/chapters 
- `"dossier"` - Dossier work
- `"planning"` - Planning work
- `"casting"` - Casting work
- `"ssml"` - SSML work
- `"voice"` - Voice work
- `"export"` - Export work

## Visual Indicators

- **Status Bar Display:** Footer shows workflow progress and next steps
  - "Workflow: Ready to start" (no steps completed)
  - "Completed: Project, Manuscript • Next: Dossier" (showing progress)
  - "🎉 All workflow steps completed!" (all done)
- **Button states:** Complete buttons show checkmark when done
- **Navigation filtering:** Only available steps are shown in sidebar

## Persistence

Workflow state is automatically saved to `workflow-state.json` in the project folder and restored when the project is reopened.

## Benefits

1. **Guided workflow:** Users follow a logical progression
2. **Clear progress tracking:** Status bar shows completed steps and what's next
3. **Non-intrusive indicators:** Progress shown in footer, not navigation icons
4. **Persistent state:** Progress saved between sessions
5. **Flexible implementation:** Easy to add completion buttons to any page
6. **User-friendly:** Prevents overwhelming new users with all options at once
