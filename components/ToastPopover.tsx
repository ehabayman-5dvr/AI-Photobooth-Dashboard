'use client';

import React, { useEffect, useId, useRef } from 'react';

export interface ToastPopoverProps {
    open: boolean;
    message: string;
    onDismiss: () => void;
    actionLabel?: string;
    onAction?: () => void;
}

/**
 * Top-layer toast notification using native popover="manual", explicit dismiss button
 * (popoverTargetAction="hide"), and an accessible notification region.
 */
export function ToastPopover({
    open,
    message,
    onDismiss,
    actionLabel,
    onAction,
}: ToastPopoverProps) {
    const id = useId();
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const onDismissRef = useRef(onDismiss);
    onDismissRef.current = onDismiss;

    useEffect(() => {
        const el = popoverRef.current as
            | (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void })
            | null;
        if (!el) return;

        if (open) {
            try {
                if (!el.matches(':popover-open')) {
                    el.showPopover?.();
                }
            } catch {
                // Fallback if popover API is unavailable
            }
        } else {
            try {
                if (el.matches(':popover-open')) {
                    el.hidePopover?.();
                }
            } catch {
                // Ignore
            }
        }
    }, [open]);

    useEffect(() => {
        const el = popoverRef.current;
        if (!el) return;
        const handleToggle = (e: Event) => {
            const toggleEvent = e as Event & { newState?: string };
            if (toggleEvent.newState === 'closed' && open) {
                onDismissRef.current();
            }
        };
        el.addEventListener('toggle', handleToggle);
        return () => el.removeEventListener('toggle', handleToggle);
    }, [open]);

    return (
        <div role="region" aria-label="Notifications">
            <div
                ref={popoverRef}
                id={id}
                popover="manual"
                className="toast-popover"
                role="status"
                aria-live="polite"
            >
                <span>{open ? message : ''}</span>
                {open && actionLabel && onAction && (
                    <button
                        type="button"
                        className="toast-popover-action"
                        onClick={onAction}
                    >
                        {actionLabel}
                    </button>
                )}
                <button
                    type="button"
                    className="toast-popover-close"
                    popoverTarget={id}
                    popoverTargetAction="hide"
                    aria-label="Dismiss notification"
                    onClick={onDismiss}
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

