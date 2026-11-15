'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ApplyForm, type ApplyContext } from './ApplyForm';

/** "Apply for leave / WFH" button that opens the request form in a popup. Press N as a shortcut. */
export function ApplyDialog({ ctx, label = 'Apply for leave / WFH', disabled = false }: { ctx: ApplyContext; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={disabled} title="Shortcut: N">
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <Modal open={open} onClose={close} title="New leave / WFH request"
        description="Within your balance it’s approved instantly. Weekends and holidays aren’t counted.">
        <ApplyForm {...ctx} onDone={close} />
      </Modal>
    </>
  );
}
