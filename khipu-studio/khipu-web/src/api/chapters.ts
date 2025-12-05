/**
 * Chapter API client
 */

export interface Chapter {
  id: string
  project_id: string
  title: string
  content: string
  order: number
  chapter_type: string
  is_complete: boolean
  word_count: number
  character_count: number
  created_at: string
  updated_at: string
}

export interface CreateChapterData {
  title: string
  content?: string
  order?: number
  is_complete?: boolean
}

export interface UpdateChapterData {
  title?: string
  content?: string
  order?: number
  chapter_type?: string
  is_complete?: boolean
}

export interface ChapterListResponse {
  items: Chapter[]
  total: number
}

/**
 * Get all chapters for a project
 */
export async function getChapters(projectId: string): Promise<ChapterListResponse> {
  const token = localStorage.getItem('access_token')
  
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/chapters/`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch chapters')
  }
  
  return response.json()
}

/**
 * Get a single chapter by ID
 */
export async function getChapter(projectId: string, chapterId: string): Promise<Chapter> {
  const token = localStorage.getItem('access_token')
  
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch chapter')
  }
  
  return response.json()
}

/**
 * Create a new chapter
 */
export async function createChapter(projectId: string, data: CreateChapterData): Promise<Chapter> {
  const token = localStorage.getItem('access_token')
  
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/chapters/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    throw new Error('Failed to create chapter')
  }
  
  return response.json()
}

/**
 * Update a chapter
 */
export async function updateChapter(
  projectId: string,
  chapterId: string,
  data: UpdateChapterData
): Promise<Chapter> {
  const token = localStorage.getItem('access_token')
  
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    throw new Error('Failed to update chapter')
  }
  
  return response.json()
}

/**
 * Delete a chapter
 */
export async function deleteChapter(projectId: string, chapterId: string): Promise<void> {
  const token = localStorage.getItem('access_token')
  
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  
  if (!response.ok) {
    throw new Error('Failed to delete chapter')
  }
}
