import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Modal } from './ui'

export function ConfirmDelete({ what, detail, onConfirm }: { what: string; detail?: string; onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}><Trash2 size={15} />Delete</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${what}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={async () => { await onConfirm(); setOpen(false) }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{detail ?? 'This cannot be undone.'} The deletion syncs to every technician.</p>
      </Modal>
    </>
  )
}
