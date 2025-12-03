import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getChapters, getChapter, createChapter, updateChapter, deleteChapter, type Chapter, type UpdateChapterData } from '../api/chapters'
import { projectsApi } from '../lib/projects'
import { setStepCompleted } from '../store/project'

export const Route = createFileRoute('/projects/$projectId/manuscript')({
  component: ManuscriptPage,
})

function ManuscriptPage() {
  const { t } = useTranslation()
  const { projectId } = Route.useParams() as { projectId: string }
  const queryClient = useQueryClient()
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [showChapterForm, setShowChapterForm] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)

  // Fetch project
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  })

  // Fetch chapters
  const { data: chaptersData, isLoading, error } = useQuery({
    queryKey: ['chapters', projectId],
    queryFn: () => getChapters(projectId),
  })

  // Fetch selected chapter content
  const { data: selectedChapter } = useQuery({
    queryKey: ['chapter', projectId, selectedChapterId],
    queryFn: () => selectedChapterId ? getChapter(projectId, selectedChapterId) : null,
    enabled: !!selectedChapterId,
  })

  // Update workflow completion for manuscript when all chapters are complete
  useEffect(() => {
    const items = chaptersData?.items || []
    // Manuscript completion (import existence) requires at least one chapter
    const manuscriptImported = items.length > 0
    setStepCompleted('manuscript', manuscriptImported)
    
    // Auto-select first chapter if none selected
    if (items.length > 0 && !selectedChapterId) {
      setSelectedChapterId(items[0].id)
    }
  }, [chaptersData, selectedChapterId])

  // Create chapter mutation
  const createMutation = useMutation({
    mutationFn: (data: { title: string; content?: string; order?: number; is_complete?: boolean }) =>
      createChapter(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', projectId] })
      setShowChapterForm(false)
    },
  })

  // Update chapter mutation
  const updateMutation = useMutation({
    mutationFn: ({ chapterId, data }: { chapterId: string; data: UpdateChapterData }) =>
      updateChapter(projectId, chapterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', projectId] })
      setEditingChapter(null)
    },
  })

  // Delete chapter mutation
  const deleteMutation = useMutation({
    mutationFn: (chapterId: string) => deleteChapter(projectId, chapterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', projectId] })
      setDeleteConfirmId(null)
    },
  })

  const handleCreateChapter = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nextOrder = (chaptersData?.items.length || 0) + 1
    
    createMutation.mutate({
      title: formData.get('title') as string,
      content: formData.get('content') as string || '',
      order: nextOrder,
      is_complete: formData.get('is_complete') === 'on',
    })
  }

  const handleUpdateChapter = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingChapter) return
    
    const formData = new FormData(e.currentTarget)
    updateMutation.mutate({
      chapterId: editingChapter.id,
      data: {
        title: formData.get('title') as string,
        content: formData.get('content') as string,
        is_complete: formData.get('is_complete') === 'on',
      },
    })
  }

  if (isLoading) {
    return (
      <div style={{ 
        padding: '2rem', 
        display: 'flex', 
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px'
      }}>
        <div style={{ 
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1.5rem',
          background: 'var(--bg-secondary)',
          borderRadius: '8px'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '2px solid var(--accent)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span style={{ color: 'var(--text-secondary)' }}>{t('app.loading')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          padding: '1rem',
          background: 'var(--error-bg)',
          border: '1px solid var(--error)',
          borderRadius: '8px',
          color: 'var(--error)'
        }}>
          {t('manuscript.loadError')}
        </div>
      </div>
    )
  }

  const chapters = chaptersData?.items || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ 
        background: 'var(--bg-secondary)', 
        borderBottom: '1px solid var(--border)',
        padding: '1.5rem 2rem',
        flexShrink: 0
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}
          >
            ← {t('projects.backToProjects')}
          </Link>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start',
            gap: '1.5rem'
          }}>
            <div>
              <h1 style={{ 
                fontSize: '1.875rem', 
                fontWeight: '700', 
                margin: '0 0 0.5rem 0',
                color: 'var(--text)'
              }}>
                {t('manuscript.title')}
              </h1>
              <p style={{ 
                margin: 0, 
                color: 'var(--text-secondary)',
                fontSize: '0.875rem'
              }}>
                {t('manuscript.description')}
              </p>
              {project && (
                <p style={{ 
                  margin: '0.5rem 0 0 0',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem'
                }}>
                  {project.title}
                </p>
              )}
            </div>
            
            <button
              onClick={() => setShowChapterForm(true)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem',
                whiteSpace: 'nowrap'
              }}
            >
              {t('manuscript.addChapter')}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ 
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        maxWidth: '1600px',
        width: '100%',
        margin: '0 auto',
        padding: '1.5rem'
      }}>
        {/* Left: Chapter List */}
        <aside style={{ 
          width: '320px',
          flexShrink: 0,
          borderRight: '1px solid var(--border)', 
          paddingRight: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ 
            overflow: 'auto', 
            flex: 1
          }}>
            {chapters.length === 0 ? (
              <div style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}>
                <p style={{ margin: '0 0 1rem 0' }}>
                  {t('manuscript.noChapters')}
                </p>
                <button
                  onClick={() => setShowChapterForm(true)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  {t('manuscript.addChapter')}
                </button>
              </div>
            ) : (
              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: 0, 
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {chapters.map((chapter, index) => {
                  const isSelected = chapter.id === selectedChapterId
                  return (
                    <li key={chapter.id}>
                      <button
                        onClick={() => setSelectedChapterId(chapter.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: isSelected ? 'var(--accent)' : 'var(--bg-secondary)',
                          color: isSelected ? 'white' : 'var(--text)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ 
                          fontWeight: 600, 
                          fontSize: '0.875rem',
                          marginBottom: '0.25rem'
                        }}>
                          {t('manuscript.chapter', { number: index + 1 })}: {chapter.title}
                        </div>
                        <div style={{ 
                          fontSize: '0.75rem',
                          opacity: isSelected ? 0.9 : 0.7,
                          display: 'flex',
                          gap: '0.75rem'
                        }}>
                          <span>{t('manuscript.words', { count: chapter.word_count })}</span>
                          {chapter.is_complete && (
                            <span>✓ {t('manuscript.complete')}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Right: Chapter Preview */}
        <section style={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: '1.5rem',
          overflow: 'hidden'
        }}>
          {selectedChapter ? (
            <div style={{ 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              background: 'var(--bg-secondary)'
            }}>
              {/* Chapter header */}
              <div style={{ 
                padding: '1rem 1.5rem', 
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg)',
                flexShrink: 0
              }}>
                <div>
                  <h2 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: '600', 
                    margin: '0 0 0.25rem 0',
                    color: 'var(--text)'
                  }}>
                    {selectedChapter.title}
                  </h2>
                  <div style={{ 
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    gap: '1rem'
                  }}>
                    <span>{t('manuscript.words', { count: selectedChapter.word_count })}</span>
                    <span>{t('manuscript.characters', { count: selectedChapter.character_count })}</span>
                    <span style={{
                      padding: '0.125rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: selectedChapter.is_complete ? 'var(--success-bg, #d1fae5)' : 'var(--warning-bg, #fef3c7)',
                      color: selectedChapter.is_complete ? 'var(--success, #065f46)' : 'var(--warning, #92400e)'
                    }}>
                      {selectedChapter.is_complete ? t('manuscript.complete') : t('manuscript.incomplete')}
                    </span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setEditingChapter(selectedChapter)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    {t('manuscript.edit')}
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(selectedChapter.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--error-bg, #fee2e2)',
                      color: 'var(--error, #dc2626)',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    {t('manuscript.delete')}
                  </button>
                </div>
              </div>
              
              {/* Chapter content */}
              <div style={{ 
                flex: 1, 
                padding: '1.5rem', 
                overflow: 'auto',
                background: 'var(--bg)'
              }}>
                <pre style={{ 
                  fontSize: '0.875rem', 
                  lineHeight: '1.6', 
                  color: 'var(--text)', 
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  margin: 0
                }}>
                  {selectedChapter.content || t('manuscript.noContent')}
                </pre>
              </div>
            </div>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontStyle: 'italic'
            }}>
              {chapters.length > 0 
                ? t('manuscript.selectChapter') 
                : t('manuscript.noChaptersDesc')}
            </div>
          )}
        </section>
      </div>

      {/* Chapter Form Modal */}
      {(showChapterForm || editingChapter) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg)',
            borderRadius: '12px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ 
                fontSize: '1.5rem', 
                fontWeight: '600', 
                margin: 0,
                color: 'var(--text)'
              }}>
                {editingChapter ? t('manuscript.edit') : t('manuscript.addChapter')}
              </h2>
            </div>

            <form onSubmit={editingChapter ? handleUpdateChapter : handleCreateChapter}>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: 'var(--text)'
                  }}>
                    {t('manuscript.chapterTitle')}
                  </label>
                  <input
                    type="text"
                    name="title"
                    defaultValue={editingChapter?.title || ''}
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: 'var(--text)'
                  }}>
                    {t('manuscript.chapterContent')}
                  </label>
                  <textarea
                    name="content"
                    defaultValue={editingChapter?.content || ''}
                    rows={12}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="is_complete"
                    id="is_complete"
                    defaultChecked={editingChapter?.is_complete || false}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="is_complete" style={{ color: 'var(--text)', cursor: 'pointer' }}>
                    {t('manuscript.markComplete')}
                  </label>
                </div>
              </div>

              <div style={{ 
                padding: '1.5rem',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '1rem'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowChapterForm(false)
                    setEditingChapter(null)
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  {t('manuscript.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: createMutation.isPending || updateMutation.isPending ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    opacity: createMutation.isPending || updateMutation.isPending ? 0.6 : 1
                  }}
                >
                  {t('manuscript.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg)',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '100%',
            padding: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text)' }}>
              {t('manuscript.deleteConfirm')}
            </h3>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {t('manuscript.cancel')}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'var(--error, #dc2626)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: deleteMutation.isPending ? 0.6 : 1
                }}
              >
                {t('manuscript.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
