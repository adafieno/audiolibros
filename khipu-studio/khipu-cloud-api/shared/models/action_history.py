"""
Action History Model for Undo/Redo functionality
Tracks automatically saved actions that can be undone/redone
"""
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from shared.db.database import Base


class ActionHistory(Base):
    """Action history for undo/redo functionality"""
    __tablename__ = "action_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Action metadata
    action_type = Column(String(100), nullable=False)  # 'character_assignment', 'voice_assignment', 'segment_update', 'plan_update'
    action_description = Column(String(500), nullable=False)  # Human-readable description
    
    # Resource affected
    resource_type = Column(String(50), nullable=False)  # 'chapter_plan', 'character', 'segment'
    resource_id = Column(UUID(as_uuid=True), nullable=False)
    
    # State snapshots
    previous_state = Column(JSONB, nullable=False)  # State before action
    new_state = Column(JSONB, nullable=False)  # State after action
    
    # Undo/Redo tracking
    is_undone = Column(Boolean, default=False, nullable=False)
    undone_at = Column(DateTime(timezone=True), nullable=True)
    
    # Sequence tracking (for maintaining order within project)
    sequence_number = Column(Integer, nullable=False)  # Auto-incrementing per project
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Metadata
    user_email = Column(String(255), nullable=True)  # Denormalized for display
    
    # Relationships
    tenant = relationship("Tenant")
    user = relationship("User")
    project = relationship("Project")
    
    def __repr__(self):
        return f"<ActionHistory {self.action_type} on {self.resource_type} {self.resource_id}>"
