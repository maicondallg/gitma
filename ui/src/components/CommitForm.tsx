import { FormEvent, KeyboardEvent, useState } from 'react'
import { History } from 'lucide-react'
import { useAppStore } from '../store/app'
import './Lists.css'

export function CommitForm() {
  const message = useAppStore((state) => state.commitMessage)
  const setMessage = useAppStore((state) => state.setCommitMessage)
  const runOperation = useAppStore((state) => state.runOperation)
  const snapshot = useAppStore((state) => state.snapshot)
  const history = useAppStore((state) => state.history)
  const context = useAppStore((state) => state.context)
  const operation = useAppStore((state) => state.operation)

  const [isAmend, setIsAmend] = useState(false)
  const [draftMessage, setDraftMessage] = useState('')

  if (context.kind !== 'local') return null

  const value = message ?? ''
  const stagedCount = snapshot?.staged?.length ?? 0
  const conflicted = Boolean(snapshot?.conflicted)

  const handleToggleAmend = (nextAmend: boolean) => {
    setIsAmend(nextAmend)
    if (nextAmend) {
      setDraftMessage(value)
      // Se a mensagem atual estiver vazia, preenche com a mensagem do último commit
      const lastCommit = history?.rows?.find((r) => r.row === 0 || r.commit)?.commit
      if (lastCommit?.subject && !value.trim()) {
        setMessage(lastCommit.subject)
      }
    } else {
      if (draftMessage !== undefined) {
        setMessage(draftMessage)
      }
    }
  }

  // Se for amend: pode submeter se tiver arquivos no stage OU se tiver mensagem
  // Se for commit normal: precisa de arquivos no stage E mensagem
  const disabled =
    Boolean(operation) ||
    conflicted ||
    (isAmend
      ? stagedCount === 0 && !value.trim()
      : !value.trim() || stagedCount === 0)

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!disabled) {
      await runOperation(isAmend ? 'commitAmend' : 'commit')
      if (isAmend) setIsAmend(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form className="lists-commit-form" onSubmit={submit} aria-label={isAmend ? 'Emendar commit' : 'Criar commit'}>
      <div className="lists-commit-header">
        <label htmlFor="commit-message">Mensagem do commit</label>
        <label
          className={`lists-amend-toggle ${isAmend ? 'active' : ''}`}
          title="Emendar alterações no último commit (git commit --amend)"
        >
          <input
            type="checkbox"
            checked={isAmend}
            onChange={(e) => handleToggleAmend(e.target.checked)}
            disabled={Boolean(operation) || conflicted}
            aria-label="Emendar último commit (amend)"
          />
          <History size={12} />
          <span>Amend</span>
        </label>
      </div>

      <textarea
        id="commit-message"
        value={value}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={isAmend ? 'Edite a mensagem ou mantenha a anterior…' : 'Descreva suas alterações…'}
        rows={3}
      />

      <div className="lists-commit-footer">
        <span className="lists-character-count">{value.length} caracteres</span>
        <button
          type="submit"
          disabled={disabled}
          className={isAmend ? 'btn-amend' : ''}
          title={
            conflicted
              ? 'Resolva os conflitos antes de criar o commit'
              : stagedCount === 0 && !isAmend
              ? 'Adicione arquivos ao stage'
              : undefined
          }
        >
          {isAmend ? 'Emendar commit' : 'Criar commit'} <kbd>Ctrl</kbd><kbd>↵</kbd>
        </button>
      </div>
    </form>
  )
}
