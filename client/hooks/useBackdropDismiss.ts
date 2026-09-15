import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react'

/**
 * Closes an overlay only when the press and release both happen on the
 * backdrop. A drag that starts inside a field must never dismiss the modal.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const pressedOnBackdrop = useRef(false)
  const latestDismiss = useRef(onDismiss)
  latestDismiss.current = onDismiss

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    pressedOnBackdrop.current = event.target === event.currentTarget
  }, [])

  const onClick = useCallback((event: MouseEvent<HTMLElement>) => {
    const shouldDismiss = pressedOnBackdrop.current && event.target === event.currentTarget
    pressedOnBackdrop.current = false
    if (shouldDismiss) latestDismiss.current()
  }, [])

  const onPointerCancel = useCallback(() => {
    pressedOnBackdrop.current = false
  }, [])

  return { onPointerDown, onPointerCancel, onClick }
}
