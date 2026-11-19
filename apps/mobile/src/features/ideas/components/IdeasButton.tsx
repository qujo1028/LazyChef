// The Ideas button in the Recipes header. It owns the sheet's open state, so the header can
// open it without the screen passing anything down. W2 may restyle it; keep the export.
import { useState } from 'react';

import { CircleIconButton } from '@/components/CircleIconButton';

import { IdeasSheet } from './IdeasSheet';

export function IdeasButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CircleIconButton icon="sparkles-outline" label="Ideas" onPress={() => setOpen(true)} />
      <IdeasSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
