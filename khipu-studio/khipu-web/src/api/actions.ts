/**
 * Actions API Client - Undo/Redo functionality
 */
import api from '../lib/api';

export interface ActionHistoryItem {
  id: string;
  action_type: string;
  action_description: string;
  resource_type: string;
  resource_id: string;
  is_undone: boolean;
  sequence_number: number;
  created_at: string;
  user_email: string | null;
}

export interface UndoRedoResponse {
  success: boolean;
  message: string;
  action_id: string;
  action_type: string;
}

export const actionsApi = {
  /**
   * Get action history for a project
   */
  async getHistory(projectId: string, limit: number = 20): Promise<ActionHistoryItem[]> {
    const response = await api.get(`/actions/history/${projectId}`, {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Undo an action
   */
  async undo(actionId: string): Promise<UndoRedoResponse> {
    const response = await api.post(`/actions/undo/${actionId}`);
    return response.data;
  },

  /**
   * Redo an action
   */
  async redo(actionId: string): Promise<UndoRedoResponse> {
    const response = await api.post(`/actions/redo/${actionId}`);
    return response.data;
  },

  /**
   * Clean up old actions
   */
  async cleanup(projectId: string, keepCount: number = 20): Promise<{ deleted: number; remaining: number }> {
    const response = await api.delete(`/actions/history/${projectId}/cleanup`, {
      params: { keep_count: keepCount }
    });
    return response.data;
  }
};
