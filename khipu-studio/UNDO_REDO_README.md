# Undo/Redo Functionality

## Overview

Global undo/redo system that tracks automatically saved actions across the application with a limit of 20 actions per project.

## Features

- **Global Undo/Redo Buttons**: Located in the project header, accessible from any page
- **Keyboard Shortcuts**: 
  - `Ctrl+Z` / `Cmd+Z` - Undo
  - `Ctrl+Y` / `Cmd+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` - Redo
- **Action History**: Maintains last 20 actions per project
- **Real-time Updates**: Action history refreshes every 5 seconds
- **Visual Feedback**: Buttons show tooltips with action descriptions
- **State Management**: Automatically invalidates related queries after undo/redo

## Tracked Actions

Currently tracked actions:
- **Character Assignment**: Assigning characters to chapter segments

Future actions to be tracked:
- Voice assignments
- Segment text modifications
- Plan regeneration
- Character voice settings changes

## Architecture

### Backend (`khipu-cloud-api`)

**Database Model** (`shared/models/action_history.py`):
```python
class ActionHistory(Base):
    id: UUID
    tenant_id: UUID
    user_id: UUID
    project_id: UUID
    action_type: str  # 'character_assignment', 'voice_assignment', etc.
    action_description: str  # Human-readable description
    resource_type: str  # 'chapter_plan', 'character', etc.
    resource_id: UUID
    previous_state: JSONB  # State before action
    new_state: JSONB  # State after action
    is_undone: bool
    sequence_number: int  # Auto-incrementing per project
    created_at: DateTime
```

**API Endpoints** (`services/actions/router.py`):
- `GET /api/v1/actions/history/{project_id}` - Get action history (last 20)
- `POST /api/v1/actions/undo/{action_id}` - Undo an action
- `POST /api/v1/actions/redo/{action_id}` - Redo an action
- `DELETE /api/v1/actions/history/{project_id}/cleanup` - Clean up old actions

**Action Logging** (`services/actions/action_logger.py`):
- `log_action()` - Generic action logger
- `log_chapter_plan_update()` - Convenience function for plan updates
- `cleanup_old_actions()` - Maintains 20 action limit

### Frontend (`khipu-web`)

**API Client** (`src/api/actions.ts`):
```typescript
export const actionsApi = {
  getHistory(projectId: string, limit: number): Promise<ActionHistoryItem[]>
  undo(actionId: string): Promise<UndoRedoResponse>
  redo(actionId: string): Promise<UndoRedoResponse>
  cleanup(projectId: string, keepCount: number): Promise<{...}>
}
```

**UndoRedo Component** (`src/components/UndoRedo.tsx`):
- Displays undo/redo buttons with visual states
- Implements keyboard shortcuts
- Queries action history every 5 seconds
- Invalidates queries after undo/redo operations
- Shows tooltips with action descriptions

## Usage

### Adding Action Logging to a New Operation

1. **Import the logger**:
```python
from services.actions.action_logger import log_chapter_plan_update
```

2. **Capture previous state before modification**:
```python
previous_segments = plan.segments.copy()
```

3. **Modify the resource**:
```python
plan.segments = new_segments
await db.commit()
```

4. **Log the action**:
```python
await log_chapter_plan_update(
    db=db,
    user=current_user,
    project_id=project_id,
    chapter_id=chapter_id,
    plan_id=plan.id,
    action_description="Action description for UI",
    previous_segments=previous_segments,
    new_segments=new_segments,
    previous_complete=False,
    new_complete=False
)
await db.commit()
```

### For Generic Actions

```python
from services.actions.action_logger import log_action

await log_action(
    db=db,
    user=current_user,
    project_id=project_id,
    action_type="voice_assignment",
    action_description="Assigned voice to character",
    resource_type="character",
    resource_id=character.id,
    previous_state={"voice_id": old_voice_id},
    new_state={"voice_id": new_voice_id}
)
```

## Limitations

- **Action Limit**: Only last 20 actions are kept per project
- **State Snapshots**: Full state is stored in JSONB, can be large for complex data
- **No Cross-Project Undo**: Actions are scoped to individual projects
- **Auto-Cleanup**: Old actions are automatically deleted when limit is exceeded

## Future Enhancements

- [ ] Action history panel showing all 20 actions with timestamps
- [ ] Selective undo (jump to any action in history)
- [ ] Action grouping (treat related actions as one)
- [ ] Conflict resolution for concurrent edits
- [ ] Export action history for auditing
- [ ] Configurable action limit per user/plan

## Testing

To test undo/redo:

1. Navigate to Orchestration page for a chapter
2. Click "Assign Characters" button
3. Wait for assignment to complete
4. Check header - undo button should be enabled
5. Click undo button or press `Ctrl+Z`
6. Verify character assignments are reverted
7. Click redo button or press `Ctrl+Y`
8. Verify character assignments are restored

## Troubleshooting

**Undo button disabled:**
- Check action history in browser devtools (React Query)
- Verify action was logged in database (`action_history` table)
- Check API logs for logging errors

**Undo doesn't revert changes:**
- Verify `previous_state` contains correct data
- Check undo endpoint logs
- Ensure queries are invalidated after undo

**Actions not appearing:**
- Check action logger is called after operations
- Verify database migration was applied
- Check for logging exceptions (should not fail operation)
