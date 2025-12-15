import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getChapters, getChapter, updateChapter, type Chapter } from '../api/chapters'
import { projectsApi } from '../lib/projects'
import { setStepCompleted } from '../store/project'
import { sanitizeTextForTTS, hasProblematicCharacters } from '../lib/text-sanitizer'
import { Button } from '../components/Button'

type ChapterType = 'chapter' | 'intro' | 'prologue' | 'epilogue' | 'credits' | 'outro'

function getChapterTypeLabel(chapterType: ChapterType): string {
  const labels: Record<ChapterType, string> = {
    chapter: 'Chapter',
    intro: 'Intro',
    prologue: 'Prologue',
    epilogue: 'Epilogue',
    credits: 'Credits',
    outro: 'Outro',
  }
  return labels[chapterType] || 'Chapter'
}

export const Route = createFileRoute('/projects/$projectId/manuscript')({
  component: ManuscriptPage,
})

function ManuscriptPage() {
  const { t } = useTranslation()
  const { projectId } = Route.useParams() as { projectId: string }
  const queryClient = useQueryClient()
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [checkingSanitization, setCheckingSanitization] = useState(false)
  const [sanitizationPreview, setSanitizationPreview] = useState<{
    issues: string[]
    changes: number
    appliedRules: string[]
    sanitizedText: string
  } | null>(null)
  const [bulkSanitizationModal, setBulkSanitizationModal] = useState<{
    chapters: Array<{ id: string; title: string; changes: number; sanitized: string; issues: string[] }>
    totalChanges: number
    totalIssues: number
  } | null>(null)
  const [applyingSanitization, setApplyingSanitization] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Update workflow completion for manuscript when all chapters exist
  useEffect(() => {
    const items = chaptersData?.items || []
    const manuscriptImported = items.length > 0
    
    // Update local state
    setStepCompleted('manuscript', manuscriptImported)
    
    // Persist to database if manuscript is complete and not already marked
    if (manuscriptImported && project && !project.workflow_completed?.manuscript) {
      const updatedWorkflow = {
        ...project.workflow_completed,
        manuscript: true
      }
      projectsApi.update(projectId, { workflow_completed: updatedWorkflow })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['project', projectId] })
        })
        .catch(error => console.error('Failed to update workflow:', error))
    }
    
    // Auto-select first chapter if none selected
    if (items.length > 0 && !selectedChapterId) {
      setSelectedChapterId(items[0].id)
    }
  }, [chaptersData, selectedChapterId, project, projectId, queryClient])

  // Handle file upload and parsing
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Clear any existing state before starting new upload
    setBulkSanitizationModal(null)
    setSelectedChapterId(null) // Clear selected chapter as it will be invalid after reimport

    // Validate file type
    const validTypes = ['.docx', '.doc', '.txt']
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!validTypes.includes(fileExt)) {
      setStatusMessage(t('manuscript.invalidFileType'))
      return
    }

    try {
      setUploading(true)
      setStatusMessage(t('manuscript.uploadingFile'))

      // Upload file
      const formData = new FormData()
      formData.append('file', file)

      const token = localStorage.getItem('access_token')
      const uploadResponse = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/chapters/manuscript/upload`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        }
      )

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload manuscript')
      }

      setUploading(false)
      setParsing(true)
      setStatusMessage(t('manuscript.parsingDocument'))

      // Parse manuscript to detect chapters
      const parseResponse = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/chapters/manuscript/parse`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      )

      if (!parseResponse.ok) {
        throw new Error('Failed to parse manuscript')
      }

      const parseResult = await parseResponse.json()
      
      setParsing(false)
      setStatusMessage(t('manuscript.chaptersDetected', { count: parseResult.data?.chapters_detected || 0 }))
      
      // Refresh chapters list and wait for it to complete
      const freshChapters = await queryClient.refetchQueries({ queryKey: ['chapters', projectId] })
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      // Automatically check TTS compatibility for all chapters
      // Use the freshly fetched data directly
      setTimeout(async () => {
        // Force another refetch to be absolutely sure we have the latest data
        await queryClient.invalidateQueries({ queryKey: ['chapters', projectId] })
        checkAllChaptersSanitization()
      }, 500)

    } catch (error) {
      console.error('Error uploading/parsing manuscript:', error)
      setStatusMessage(t('manuscript.uploadError'))
      setUploading(false)
      setParsing(false)
    }
  }

  // Check TTS compatibility for all chapters
  const checkAllChaptersSanitization = async () => {
    if (!project || !chaptersData?.items) return

    const allChapters = chaptersData.items
    if (allChapters.length === 0) return

    console.log('[TTS Check] Starting check for', allChapters.length, 'chapters')
    console.log('[TTS Check] Sample chapter content length:', allChapters[0]?.content?.length)

    setCheckingSanitization(true)
    try {
      const language = project.language || 'en-US'
      const chaptersToSanitize: Array<{ id: string; title: string; changes: number; sanitized: string; issues: string[] }> = []
      let totalChanges = 0
      let totalIssues = 0

      // Check each chapter
      for (const chapter of allChapters) {
        const text = chapter.content || ''
        console.log(`[TTS Check] Checking chapter "${chapter.title}" - content length: ${text.length}`)
        const checkResult = hasProblematicCharacters(text, language)
        
        console.log(`[TTS Check] Chapter "${chapter.title}" - has problems: ${checkResult.hasProblems}, issues: ${checkResult.issues.length}`)
        
        if (checkResult.hasProblems) {
          const sanitizeResult = sanitizeTextForTTS(text, { language })
          
          // Find first quote character to debug
          const quoteMatch = text.match(/["""'']/);
          const quoteDebug = quoteMatch ? {
            char: quoteMatch[0],
            code: quoteMatch[0].charCodeAt(0).toString(16),
            position: text.indexOf(quoteMatch[0])
          } : null;
          
          console.log(`[TTS Check] Chapter "${chapter.title}" - sanitization result:`, {
            changes: sanitizeResult.changes,
            oldLength: text.length,
            newLength: sanitizeResult.sanitized.length,
            areSame: text === sanitizeResult.sanitized,
            firstIssue: checkResult.issues[0],
            quoteDebug,
            oldSample: text.substring(0, 200),
            newSample: sanitizeResult.sanitized.substring(0, 200)
          })
          
          // Only add if sanitization actually changes the content
          if (sanitizeResult.changes > 0 && text !== sanitizeResult.sanitized) {
            console.log(`[TTS Check] Chapter "${chapter.title}" needs ${sanitizeResult.changes} changes`)
            chaptersToSanitize.push({
              id: chapter.id,
              title: chapter.title,
              changes: sanitizeResult.changes,
              sanitized: sanitizeResult.sanitized,
              issues: checkResult.issues,
            })
            totalChanges += sanitizeResult.changes
            totalIssues += checkResult.issues.length
          }
        }
      }

      console.log(`[TTS Check] Check complete - ${chaptersToSanitize.length} chapters need sanitization`)

      if (chaptersToSanitize.length === 0) {
        setStatusMessage(t('manuscript.noTTSIssues', 'No TTS compatibility issues found!'))
        setTimeout(() => setStatusMessage(''), 3000)
      } else {
        // Show confirmation modal
        setBulkSanitizationModal({
          chapters: chaptersToSanitize,
          totalChanges,
          totalIssues,
        })
      }
    } catch (error) {
      console.error('Error checking bulk sanitization:', error)
      setStatusMessage(t('manuscript.sanitizationCheckError', 'Error checking TTS compatibility'))
      setTimeout(() => setStatusMessage(''), 3000)
    } finally {
      setCheckingSanitization(false)
    }
  }

  // Check text sanitization for TTS compatibility (single chapter)
  const checkTextSanitization = async () => {
    if (!selectedChapter || !project) return

    setCheckingSanitization(true)
    try {
      const text = selectedChapter.content || ''
      const language = project.language || 'en-US'

      // Check for problematic characters
      const checkResult = hasProblematicCharacters(text, language)

      if (!checkResult.hasProblems) {
        setStatusMessage(t('manuscript.noTTSIssues', 'No TTS compatibility issues found!'))
        setTimeout(() => setStatusMessage(''), 3000)
        setSanitizationPreview(null)
        setCheckingSanitization(false)
        return
      }

      // Preview sanitization changes
      const sanitizeResult = sanitizeTextForTTS(text, { language })

      setSanitizationPreview({
        issues: checkResult.issues,
        changes: sanitizeResult.changes,
        appliedRules: sanitizeResult.appliedRules,
        sanitizedText: sanitizeResult.sanitized,
      })
    } catch (error) {
      console.error('Error checking sanitization:', error)
      setStatusMessage(t('manuscript.sanitizationCheckError', 'Error checking TTS compatibility'))
      setTimeout(() => setStatusMessage(''), 3000)
    } finally {
      setCheckingSanitization(false)
    }
  }

  // Apply sanitization to chapter
  const applySanitization = async () => {
    if (!sanitizationPreview || !selectedChapter || !selectedChapterId) return

    try {
      // Update chapter with sanitized content
      await updateChapter(projectId, selectedChapterId, {
        content: sanitizationPreview.sanitizedText,
      })

      // Refresh chapter data
      queryClient.invalidateQueries({ queryKey: ['chapter', projectId, selectedChapterId] })
      queryClient.invalidateQueries({ queryKey: ['chapters', projectId] })

      setStatusMessage(
        t('manuscript.sanitizationApplied', 'TTS sanitization applied successfully!')
      )
      setTimeout(() => setStatusMessage(''), 3000)
      setSanitizationPreview(null)
    } catch (error) {
      console.error('Error applying sanitization:', error)
      setStatusMessage(t('manuscript.sanitizationApplyError', 'Error applying sanitization'))
      setTimeout(() => setStatusMessage(''), 3000)
    }
  }

  // Apply bulk sanitization to all chapters with issues
  const applyBulkSanitization = async () => {
    if (!bulkSanitizationModal) return

    setApplyingSanitization(true)
    try {
      console.log('[TTS Sanitization] Applying sanitization to chapters:', bulkSanitizationModal.chapters.map(c => ({ id: c.id, title: c.title, changes: c.changes })))
      
      // Update all chapters in parallel
      const updatePromises = bulkSanitizationModal.chapters.map(async (chapter) => {
        console.log(`[TTS Sanitization] Updating chapter ${chapter.title} (${chapter.id})`)
        console.log(`[TTS Sanitization] Sanitized content length: ${chapter.sanitized.length}`)
        
        const result = await updateChapter(projectId, chapter.id, {
          content: chapter.sanitized,
        })
        
        console.log(`[TTS Sanitization] Chapter ${chapter.title} updated successfully`)
        return result
      })

      const results = await Promise.all(updatePromises)
      console.log(`[TTS Sanitization] All ${results.length} chapters updated successfully`)

      // Clear modal first to prevent re-use of stale data
      const sanitizedCount = bulkSanitizationModal.chapters.length
      setBulkSanitizationModal(null)

      // Refresh all chapter data and wait for refetch
      await queryClient.refetchQueries({ queryKey: ['chapters', projectId] })
      if (selectedChapterId) {
        await queryClient.refetchQueries({ queryKey: ['chapter', projectId, selectedChapterId] })
      }
      
      console.log('[TTS Sanitization] Chapter data refetched from server')

      setStatusMessage(
        t('manuscript.bulkSanitizationApplied', `TTS sanitization applied to ${sanitizedCount} chapters!`)
      )
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      console.error('[TTS Sanitization] Error applying bulk sanitization:', error)
      // Clear modal on error to force fresh check next time
      setBulkSanitizationModal(null)
      setStatusMessage(t('manuscript.bulkSanitizationError', 'Error applying sanitization to chapters'))
      setTimeout(() => setStatusMessage(''), 3000)
    } finally {
      setApplyingSanitization(false)
    }
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
  const isProcessing = uploading || parsing
  const manuscriptComplete = chapters.length > 0

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Page Header */}
      <div
        style={{
          background: 'var(--panel)',
          borderColor: 'var(--border)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {t('manuscript.title', 'Manuscript')}
              </h1>
              {manuscriptComplete && (
                <span style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  padding: '0.25rem 0.75rem', 
                  borderRadius: '9999px', 
                  fontSize: '0.875rem', 
                  fontWeight: 500,
                  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                  background: '#22c55e', 
                  color: '#052e12' 
                }}>
                  {t('project.completed', 'Completed')}
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
              {t('manuscript.description', 'Upload your manuscript document and manage chapters.')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.doc,.txt"
              onChange={handleFileUpload}
              disabled={isProcessing}
              style={{ display: 'none' }}
              id={`manuscript-upload-${projectId}`}
            />
            <label htmlFor={`manuscript-upload-${projectId}`}>
              <Button
                variant="primary"
                disabled={isProcessing}
                loading={uploading || parsing}
                as="span"
                style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
              >
                {uploading ? t('manuscript.uploading') : parsing ? t('manuscript.parsing') : t('manuscript.importDocx')}
              </Button>
            </label>
            
            {chapters.length > 0 && (
              <Button
                variant="primary"
                onClick={checkAllChaptersSanitization}
                disabled={checkingSanitization}
                loading={checkingSanitization}
              >
                {t('manuscript.checkTTS', 'Check for TTS Compatibility')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {statusMessage && (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            background: 'var(--panel)',
          }}
        >
          <p style={{ color: 'var(--text)', margin: 0 }}>
            {statusMessage}
          </p>
        </div>
      )}

      {/* Sanitization Preview Panel */}
      {sanitizationPreview && (
        <div style={{ 
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
          padding: '0 2rem 1.5rem 2rem'
        }}>
          <div
            style={{
              padding: '1.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text)', margin: '0 0 0.5rem 0' }}>
                  {t('manuscript.ttsIssuesFound', 'TTS Compatibility Issues Found')}
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {sanitizationPreview.issues.length} {t('manuscript.issuesDetected', 'issue(s) detected')} • {sanitizationPreview.changes} {t('manuscript.changesProposed', 'change(s) proposed')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={applySanitization}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    background: '#22c55e',
                    color: '#052e12',
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  {t('manuscript.applySanitization', 'Apply Sanitization')}
                </button>
                <button
                  onClick={() => setSanitizationPreview(null)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                >
                  {t('manuscript.dismiss', 'Dismiss')}
                </button>
              </div>
            </div>

            {/* Issues List */}
            <details style={{ marginTop: '1rem' }}>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--text)',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px',
                }}
              >
                {t('manuscript.viewDetails', 'View Details')}
              </summary>
              <div style={{ marginTop: '1rem', paddingLeft: '1rem' }}>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: 0 }}>
                  {sanitizationPreview.issues.map((issue, idx) => (
                    <li key={idx} style={{ fontSize: '0.875rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
                      {issue}
                    </li>
                  ))}
                </ul>
                {sanitizationPreview.appliedRules.length > 0 && (
                  <>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', marginTop: '1.5rem', marginBottom: '0.75rem' }}>
                      {t('manuscript.appliedRules', 'Applied Sanitization Rules:')}
                    </h4>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: 0 }}>
                      {sanitizationPreview.appliedRules.map((rule, idx) => (
                        <li key={idx} style={{ fontSize: '0.875rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Bulk Sanitization Modal */}
      {bulkSanitizationModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => !applyingSanitization && setBulkSanitizationModal(null)}
        >
          <div
            style={{
              maxWidth: '600px',
              width: '90%',
              background: 'var(--panel)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '2rem',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 0.5rem 0' }}>
              {t('manuscript.ttsIssuesDetected', 'TTS Compatibility Issues Detected')}
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {t('manuscript.bulkSanitizationMessage', `Found ${bulkSanitizationModal.totalIssues} TTS compatibility issues across ${bulkSanitizationModal.chapters.length} chapters. Would you like to apply ${bulkSanitizationModal.totalChanges} automatic fixes?`)}
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
                {t('manuscript.affectedChapters', 'Affected Chapters:')}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {bulkSanitizationModal.chapters.map((chapter) => (
                  <details
                    key={chapter.id}
                    style={{
                      background: 'var(--bg-secondary)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    <summary
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{chapter.title}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {chapter.issues.length} {t('manuscript.issues', 'issues')} • {chapter.changes} {t('manuscript.changes', 'changes')}
                      </span>
                    </summary>
                    <div style={{ padding: '0 0.75rem 0.75rem 0.75rem' }}>
                      <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {chapter.issues.map((issue, idx) => (
                          <li key={idx} style={{ marginBottom: '0.25rem' }}>
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setBulkSanitizationModal(null)}
                disabled={applyingSanitization}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text)',
                  cursor: applyingSanitization ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border)',
                  opacity: applyingSanitization ? 0.5 : 1,
                }}
              >
                {t('manuscript.cancel', 'Cancel')}
              </button>
              <button
                onClick={applyBulkSanitization}
                disabled={applyingSanitization}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  background: '#22c55e',
                  color: '#052e12',
                  cursor: applyingSanitization ? 'not-allowed' : 'pointer',
                  border: 'none',
                  opacity: applyingSanitization ? 0.5 : 1,
                }}
              >
                {applyingSanitization 
                  ? t('manuscript.applying', 'Applying...') 
                  : t('manuscript.applyToAll', 'Apply to All Chapters')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Panel Layout */}
      <div style={{ display: 'flex', gap: '1.5rem', minHeight: '600px' }}>
        {/* Chapter List Sidebar */}
        <div
          style={{
            width: '320px',
            flexShrink: 0,
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
            }}
          >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {t('manuscript.chapters', 'Chapters')}
            </h2>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
            {chapters.length === 0 ? (
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '2rem 1rem',
                  margin: 0,
                }}
              >
                {t('manuscript.noChapters', 'No chapters yet. Import a document to get started.')}
              </p>
            ) : (
              chapters.map((chapter, index) => {
                const chapterType = (chapter as any).chapter_type as ChapterType || 'chapter'
                const isSpecial = chapterType !== 'chapter'
                
                return (
                  <button
                    key={chapter.id}
                    onClick={() => setSelectedChapterId(chapter.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem',
                      borderRadius: '0.375rem',
                      marginBottom: '0.25rem',
                      background: selectedChapterId === chapter.id ? 'var(--accent)' : 'transparent',
                      color: selectedChapterId === chapter.id ? '#fff' : 'var(--text)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 500, flex: 1 }}>{chapter.title}</span>
                      {isSpecial && (
                        <span
                          style={{
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            padding: '0.125rem 0.375rem',
                            borderRadius: '0.25rem',
                            background: 'var(--accent)',
                            color: '#fff',
                            textTransform: 'uppercase',
                          }}
                        >
                          {getChapterTypeLabel(chapterType)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                      {t('manuscript.words', { count: chapter.word_count })}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Chapter Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedChapter ? (
            <div
              style={{
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                padding: '1.5rem',
                height: '100%',
                overflow: 'auto',
              }}
            >
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                    {selectedChapter.title}
                  </h2>
                  <select
                    value={selectedChapter.chapter_type || 'chapter'}
                    onChange={async (e) => {
                      const newType = e.target.value
                      try {
                        await updateChapter(projectId, selectedChapter.id, { chapter_type: newType })
                        queryClient.invalidateQueries({ queryKey: ['chapters', projectId] })
                        queryClient.invalidateQueries({ queryKey: ['chapter', projectId, selectedChapterId] })
                      } catch (error) {
                        console.error('Failed to update chapter type:', error)
                      }
                    }}
                    style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--border)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="chapter">Chapter</option>
                    <option value="intro">Intro</option>
                    <option value="prologue">Prologue</option>
                    <option value="epilogue">Epilogue</option>
                    <option value="credits">Credits</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  <span>
                    {t('manuscript.words', { count: selectedChapter.word_count })}
                  </span>
                  <span>
                    {t('manuscript.characters', { count: selectedChapter.character_count })}
                  </span>
                </div>
              </div>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.75',
                  color: 'var(--text)',
                }}
              >
                {selectedChapter.content}
              </div>
            </div>
          ) : (
            <div
              style={{
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <p style={{ fontSize: '1rem', color: 'var(--text-muted)', margin: 0 }}>
                {t('manuscript.selectChapter', 'Select a chapter to view its content')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
