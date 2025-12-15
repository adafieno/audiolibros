# Orchestration Module - Implementation Starting Point

## Current State Analysis

### ✅ What Already Exists

**Backend:**
- Chapter model (`shared/models/chapter.py`) - basic structure ✅
- Chapters router (`services/chapters/router.py`) - CRUD operations ✅
- Chapters service mounted in main.py ✅
- LLM client (`services/llm_client.py`) - for character assignment ✅
- Characters service - for voice data ✅
- Voices service - for audio generation ✅

**Frontend:**
- Orchestration route stub (`khipu-web/src/routes/projects.$projectId.orchestration.tsx`) ✅
- Chapters API client (`khipu-web/src/api/chapters.ts`) - basic CRUD ✅
- Chapter TypeScript interface ✅

### ❌ What Needs to Be Created

**Backend:**
- `ChapterPlan` database model
- Planning service directory and router
- Segmentation service (Python)
- Character assignment service (LLM)
- Plan management endpoints (generate, get, update)
- Segment operations endpoints (split, merge, delete)
- Completion tracking endpoints
- Revision marking endpoints

**Frontend:**
- Planning TypeScript types
- Planning API client
- Orchestration page UI components
- EditablePreview component
- SegmentTable component
- Audio cache system
- useAudioCache hook
- useSegmentOperations hook

---

## 🚀 Phase 1: Foundation - Step-by-Step Implementation

### Step 1: Database Model (Backend) ⭐ START HERE

**File:** `khipu-cloud-api/shared/models/plan.py` (NEW)

**Action:** Create the ChapterPlan model to store segment data

```python
"""Plan model for chapter orchestration."""
from datetime import datetime
from uuid import UUID
from sqlalchemy import String, Boolean, DateTime, ForeignKey, JSON, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from shared.db.database import Base


class ChapterPlan(Base):
    """Chapter plan with segments for TTS orchestration."""
    
    __tablename__ = "chapter_plans"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    
    # Foreign keys
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    chapter_id: Mapped[UUID] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Plan data - stored as JSON array of segments
    segments: Mapped[dict] = mapped_column(JSONB, nullable=False)
    
    # Status
    is_complete: Mapped[bool] = mapped_column(nullable=False, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=datetime.utcnow)
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="chapter_plans")
    chapter: Mapped["Chapter"] = relationship("Chapter", back_populates="plan", uselist=False)
    
    def __repr__(self):
        return f"<ChapterPlan for Chapter {self.chapter_id}>"
```

**Then:**
1. Update `shared/models/__init__.py` to import `ChapterPlan`
2. Add `chapter_plans` relationship to `Project` model
3. Add `plan` relationship to `Chapter` model

---

### Step 2: Database Migration (Backend)

**Action:** Create Alembic migration for ChapterPlan table

```bash
cd khipu-cloud-api
alembic revision -m "add_chapter_plans_table"
```

**Edit the migration file to:**
- Create `chapter_plans` table
- Add foreign keys to `projects` and `chapters`
- Add indexes on `project_id` and `chapter_id`

```bash
alembic upgrade head
```

---

### Step 3: Backend Service Structure (Backend)

**Create directory:** `khipu-cloud-api/services/planning/`

**Files to create:**
```
services/planning/
├── __init__.py
├── router.py          # FastAPI router with endpoints
├── schemas.py         # Pydantic schemas for request/response
├── segmentation.py    # Text segmentation logic
└── character_assignment.py  # LLM character assignment
```

**Start with `router.py` (minimal structure):**

```python
"""Planning/Orchestration API Router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.database import get_db
from shared.models import User
from shared.auth import get_current_active_user

router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "planning"}
```

---

### Step 4: Mount Planning Router (Backend)

**File:** `khipu-cloud-api/main.py`

**Action:** Add planning router to main app

```python
# Add import
from services.planning.router import router as planning_router

# Add router (around line 64, after other routers)
app.include_router(
    planning_router, 
    prefix="/api/v1/projects/{project_id}/planning", 
    tags=["Planning"]
)
```

**Test:** Start server and visit `/docs` to see new planning endpoints

---

### Step 5: Frontend Types (Frontend)

**File:** `khipu-web/src/types/planning.ts` (NEW)

**Action:** Create TypeScript types for planning

```typescript
export interface Segment {
  segment_id: number;
  start_idx: number;
  end_idx: number;
  delimiter: string;
  text: string;
  originalText?: string;
  voice?: string;
  needsRevision?: boolean;
}

export interface PlanRow {
  rowKey: string;
  segmentId: number;
  start: number;
  end: number;
  length: number;
  voice: string;
  delimiter: string;
}

export interface ChapterStatus {
  hasText: boolean;
  hasPlan: boolean;
  isComplete: boolean;
}

export interface ChapterPlan {
  id: string;
  project_id: string;
  chapter_id: string;
  segments: Segment[];
  is_complete: boolean;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SegmentOpResult {
  success: boolean;
  message?: string;
  newSegments?: Segment[];
}

export interface AzureCaps {
  maxKB: number;
  hardCapMin: number;
  wpm: number;
  overhead: number;
}

export interface PlanGenerateOptions {
  maxKB?: number;
}

export interface PlanGenerateResponse {
  plan: ChapterPlan;
  message?: string;
}
```

---

### Step 6: Frontend API Client (Frontend)

**File:** `khipu-web/src/api/planning.ts` (NEW)

**Action:** Create API client for planning operations

```typescript
import type { ChapterPlan, Segment, PlanGenerateOptions } from '../types/planning';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function getAuthHeaders() {
  const token = localStorage.getItem('access_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export const planningApi = {
  /**
   * Health check for planning service
   */
  async healthCheck(): Promise<{ status: string }> {
    const response = await fetch(`${API_BASE}/api/v1/projects/test/planning/health`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Planning service health check failed');
    }
    
    return response.json();
  },

  /**
   * Generate plan for a chapter
   */
  async generatePlan(
    projectId: string,
    chapterId: string,
    options: PlanGenerateOptions = {}
  ): Promise<ChapterPlan> {
    const response = await fetch(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/generate`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(options),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to generate plan');
    }
    
    return response.json();
  },

  /**
   * Get existing plan for a chapter
   */
  async getPlan(projectId: string, chapterId: string): Promise<ChapterPlan | null> {
    const response = await fetch(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/plan`,
      {
        headers: getAuthHeaders(),
      }
    );
    
    if (response.status === 404) {
      return null; // No plan exists yet
    }
    
    if (!response.ok) {
      throw new Error('Failed to fetch plan');
    }
    
    return response.json();
  },

  /**
   * Update plan segments
   */
  async updatePlan(
    projectId: string,
    chapterId: string,
    segments: Segment[]
  ): Promise<ChapterPlan> {
    const response = await fetch(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/plan`,
      {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ segments }),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to update plan');
    }
    
    return response.json();
  },
};
```

---

### Step 7: Basic UI Structure (Frontend)

**File:** `khipu-web/src/routes/projects.$projectId.orchestration.tsx`

**Action:** Replace stub with basic structure

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { getChapters, type Chapter } from '../api/chapters';
import { planningApi } from '../api/planning';
import type { Segment, ChapterPlan } from '../types/planning';

export const Route = createFileRoute('/projects/$projectId/orchestration')({
  component: OrchestrationPage,
});

function OrchestrationPage() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  
  // State
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [plan, setPlan] = useState<ChapterPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Load chapters on mount
  useEffect(() => {
    loadChapters();
  }, [projectId]);

  // Load plan when chapter selected
  useEffect(() => {
    if (selectedChapter) {
      loadPlan();
    }
  }, [selectedChapter]);

  const loadChapters = async () => {
    try {
      const response = await getChapters(projectId);
      setChapters(response.items);
    } catch (error) {
      console.error('Failed to load chapters:', error);
      setMessage('Failed to load chapters');
    }
  };

  const loadPlan = async () => {
    try {
      setLoading(true);
      const planData = await planningApi.getPlan(projectId, selectedChapter);
      setPlan(planData);
    } catch (error) {
      console.error('Failed to load plan:', error);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!selectedChapter) return;
    
    try {
      setLoading(true);
      setMessage('Generating plan...');
      const newPlan = await planningApi.generatePlan(projectId, selectedChapter);
      setPlan(newPlan);
      setMessage('Plan generated successfully!');
    } catch (error) {
      console.error('Failed to generate plan:', error);
      setMessage('Failed to generate plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="rounded-lg border shadow mb-6 p-6" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
          {t('orchestration.title', 'Orchestration')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('orchestration.description', 'Plan chapter segments and scene breaks.')}
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className="mb-4 p-3 rounded" style={{ background: 'var(--panel-accent)', border: '1px solid var(--border)' }}>
          {message}
        </div>
      )}

      {/* Chapter Selector */}
      <div className="mb-6">
        <label className="block mb-2" style={{ color: 'var(--text)' }}>
          Select Chapter:
        </label>
        <select
          value={selectedChapter}
          onChange={(e) => setSelectedChapter(e.target.value)}
          className="w-full p-2 rounded"
          style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">-- Select a chapter --</option>
          {chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.title}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      {selectedChapter && (
        <div className="mb-6">
          <button
            onClick={handleGeneratePlan}
            disabled={loading}
            className="px-4 py-2 rounded"
            style={{
              background: loading ? 'var(--muted)' : 'var(--accent)',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Generating...' : 'Generate Plan'}
          </button>
        </div>
      )}

      {/* Plan Display */}
      {plan && (
        <div className="rounded-lg border p-4" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
            Plan Segments ({plan.segments?.length || 0})
          </h2>
          
          {plan.segments && plan.segments.length > 0 ? (
            <div className="space-y-2">
              {plan.segments.map((segment: Segment) => (
                <div
                  key={segment.segment_id}
                  className="p-3 rounded"
                  style={{ background: 'var(--panel-accent)', border: '1px solid var(--border)' }}
                >
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Segment #{segment.segment_id} | {segment.delimiter} | 
                    [{segment.start_idx}-{segment.end_idx}] | 
                    Voice: {segment.voice || 'unassigned'}
                  </div>
                  <div className="mt-2" style={{ color: 'var(--text)' }}>
                    {segment.text.substring(0, 200)}
                    {segment.text.length > 200 && '...'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>No segments yet</p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## ✅ Verification Steps

After completing these 7 steps, verify:

1. **Database:**
   ```bash
   # Connect to database and verify table exists
   psql -d khipu_dev -c "\d chapter_plans"
   ```

2. **Backend:**
   ```bash
   # Start server
   cd khipu-cloud-api
   python -m uvicorn main:app --reload
   
   # Visit http://localhost:8000/docs
   # Look for "Planning" section with endpoints
   ```

3. **Frontend:**
   ```bash
   # Start dev server
   cd khipu-web
   npm run dev
   
   # Visit http://localhost:5173/projects/{project-id}/orchestration
   # Should see chapter selector and Generate Plan button
   ```

---

## 📊 Progress Tracking

- [ ] Step 1: ChapterPlan database model created
- [ ] Step 2: Database migration applied
- [ ] Step 3: Planning service structure created
- [ ] Step 4: Planning router mounted in main.py
- [ ] Step 5: Frontend types created
- [ ] Step 6: Frontend API client created
- [ ] Step 7: Basic UI structure implemented

**Status:** 0/7 complete

---

## 🎯 Next Steps After Foundation

Once Phase 1 is complete, proceed to:

**Phase 2: Core Functionality**
- Implement segmentation service (Python)
- Add plan generation endpoint
- Display segments in a table
- Add segment editing capabilities

See the full [ORCHESTRATION_IMPLEMENTATION_PLAN.md](./ORCHESTRATION_IMPLEMENTATION_PLAN.md) for complete roadmap.

---

## 🔗 Key Files Reference

**Backend:**
- Model: `khipu-cloud-api/shared/models/plan.py`
- Router: `khipu-cloud-api/services/planning/router.py`
- Main: `khipu-cloud-api/main.py`

**Frontend:**
- Types: `khipu-web/src/types/planning.ts`
- API: `khipu-web/src/api/planning.ts`
- UI: `khipu-web/src/routes/projects.$projectId.orchestration.tsx`

**Desktop Reference:**
- Full implementation: `app/src/pages/Planning.tsx` (2626 lines)
