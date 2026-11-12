/** @jsxImportSource react */

import { ErrorDialog as ErrorDialogPrimitive } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef } from 'react';

import { Button } from './button';

/** "A network error (status 404) occurred while loading manifest" -> "NETWORK ERROR 404". */
function shortError(message: string): string {
  const status = message.match(/status\s+(\d{3})/i)?.[1];
  if (/network/i.test(message)) return `NETWORK ERROR${status ? ` ${status}` : ''}`;
  if (/decod/i.test(message)) return 'VIDEO CAN’T BE DECODED';
  if (/support|format/i.test(message)) return 'FORMAT NOT SUPPORTED';
  return status ? `ERROR ${status}` : 'PLAYBACK ERROR';
}

/**
 * HISS: GAME OVER. A short reason and one button, CONTINUE?, that closes the dialog and reloads the video.
 */
export function ErrorDialog() {
  const error = usePlayer((s) => s.error) as { message?: string } | null;
  const message = error?.message ?? '';
  const closeRef = useRef<HTMLButtonElement>(null);

  // the dialog opens with focus on CONTINUE?, the action most people want
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [error]);

  return (
    <ErrorDialogPrimitive.Root>
      <ErrorDialogPrimitive.Backdrop className={'media-dialog-backdrop'} />
      <ErrorDialogPrimitive.Popup
        className={'media-dialog-popup'}
        onKeyDown={(event) => {
          // CONTINUE? is the only control, so Tab stays on it rather than leaving the dialog
          if (event.key === 'Tab') {
            event.preventDefault();
            closeRef.current?.focus({ preventScroll: true });
          }
        }}
      >
        <ErrorDialogPrimitive.Title className={'media-dialog-title'} />
        <div className="coil-err-reason">
          <span>{shortError(message)}</span>
          {/* the full message is read out by screen readers, but not shown */}
          <ErrorDialogPrimitive.Description className={'media-dialog-description coil-err-details'} />
        </div>
        <ErrorDialogPrimitive.Close
          render={<Button ref={closeRef} />}
          className={'media-dialog-close'}
          aria-label="Continue: reload the video"
          onClick={(event) => {
            // closing the error also tries again, so recovery is one step
            event.currentTarget.dispatchEvent(new CustomEvent('coil-retry', { bubbles: true }));
          }}
        >
          CONTINUE?
        </ErrorDialogPrimitive.Close>
      </ErrorDialogPrimitive.Popup>
    </ErrorDialogPrimitive.Root>
  );
}
