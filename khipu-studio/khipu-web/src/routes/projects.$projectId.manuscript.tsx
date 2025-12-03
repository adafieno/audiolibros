import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getChapters, getChapter, updateChapter, type Chapter } from '../api/chapters'
import { projectsApi } from '../lib/projects'
import { setStepCompleted } from '../store/project'
import { sanitizeTextForTTS, hasProblematicCharacters } from '../lib/text-sanitizer'

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
    setStepCompleted('manuscript', manuscriptImported)
    
    // Auto-select first chapter if none selected
    if (items.length > 0 && !selectedChapterId) {
      setSelectedChapterId(items[0].id)
    }
  }, [chaptersData, selectedChapterId])

  // Handle file upload and parsing
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

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
        `${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/manuscript/upload`,
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
        `${import.meta.env.VITE_API_BASE_URL}/api/v1/projects/${projectId}/manuscript/parse`,
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
      
      // Refresh chapters list
      queryClient.invalidateQueries({ queryKey: ['chapters', projectId] })
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      // Clear status message after 3 seconds
      setTimeout(() => setStatusMessage(''), 3000)

    } catch (error) {
      console.error('Error uploading/parsing manuscript:', error)
      setStatusMessage(t('manuscript.uploadError'))
      setUploading(false)
      setParsing(false)
    }
  }

  // Check text sanitization for TTS compatibility
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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text)' }}>
              {t('manuscript.title', 'Manuscript')}
            </h1>
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
            <label
              htmlFor={`manuscript-upload-${projectId}`}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                background: isProcessing ? 'var(--bg-secondary)' : 'var(--accent)',
                color: isProcessing ? 'var(--text-secondary)' : '#fff',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                border: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {uploading ? t('manuscript.uploading') : parsing ? t('manuscript.parsing') : t('manuscript.importDocx')}
            </label>
            
            {chapters.length > 0 && selectedChapter && (
              <button
                onClick={checkTextSanitization}
                disabled={checkingSanitization}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  cursor: checkingSanitization ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {checkingSanitization
                  ? t('manuscript.checking', 'Checking...')
                  : t('manuscript.checkTTS', 'Check TTS Compatibility')}
              </button>
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
              chapters.map((chapter, index) => (
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
                  <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{chapter.title}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    {chapter.word_count} {t('manuscript.words', 'words')}
                  </div>
                </button>
              ))
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
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', margin: 0 }}>
                  {selectedChapter.title}
                </h2>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  <span>
                    {selectedChapter.word_count} {t('manuscript.words', 'words')}
                  </span>
                  <span>
                    {selectedChapter.character_count} {t('manuscript.characters', 'characters')}
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
