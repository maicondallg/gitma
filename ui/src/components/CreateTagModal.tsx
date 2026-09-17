import { useState } from 'react';
import { Tag, X } from 'lucide-react';

interface CreateTagModalProps {
  isOpen: boolean;
  commitOid: string;
  onClose: () => void;
  onSubmit: (params: { name: string; message?: string; oid: string }) => void;
}

export function CreateTagModal({
  isOpen,
  commitOid,
  onClose,
  onSubmit,
}: CreateTagModalProps) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      message: message.trim() ? message.trim() : undefined,
      oid: commitOid,
    });
    setName('');
    setMessage('');
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Tag size={16} />
            <h3>Criar Tag</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              Criando tag no commit <code>{commitOid.slice(0, 7)}</code>
            </p>

            <div className="form-group">
              <label htmlFor="tag-name">Nome da Tag</label>
              <input
                id="tag-name"
                type="text"
                autoFocus
                placeholder="Ex: v1.0.0, release-2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="tag-message">Mensagem (opcional para tag anotada)</label>
              <textarea
                id="tag-message"
                rows={3}
                placeholder="Descrição ou notas desta versão..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              Criar Tag
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
