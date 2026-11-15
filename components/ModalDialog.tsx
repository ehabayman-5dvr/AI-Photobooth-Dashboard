'use client';

import React, { useEffect, useRef } from 'react';

let supportsDisplayTransition: boolean | undefined;
function canTransitionDisplay(): boolean {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    if (
        typeof window === 'undefined' ||
        !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
        !document.body
    ) {
        return false;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
    return (
        typeof window !== 'undefined' &&
        Boolean(window.CSS?.supports?.('overlay', 'auto')) &&
        canTransitionDisplay()
    );
}

async function closeTopLayer(dialog: HTMLDialogElement) {
    if (!dialog.open) return;
    if (!supportsTopLayerExit()) {
        dialog.setAttribute('data-closing', '');
        const animations = dialog.getAnimations({ subtree: true });
        if (animations.length > 0) {
            await Promise.race([
                Promise.allSettled(animations.map(a => a.finished)),
                new Promise(resolve => setTimeout(resolve, 600)),
            ]);
        }
        if (!dialog.hasAttribute('data-closing')) return;
        dialog.removeAttribute('data-closing');
    }
    if (dialog.open) {
        dialog.close();
    }
}

export interface ModalDialogProps {
    open: boolean;
    onClose: () => void;
    variant?: 'modal' | 'drawer' | 'lightbox';
    closeOnBackdrop?: boolean;
    ariaLabel?: string;
    ariaLabelledBy?: string;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}

/**
 * Native Top-Layer <dialog> wrapper with showModal(), closedby="any" light-dismiss
 * fallback, and @starting-style / data-closing top-layer exit transitions.
 */
export function ModalDialog({
    open,
    onClose,
    variant = 'modal',
    closeOnBackdrop = true,
    ariaLabel,
    ariaLabelledBy,
    className = '',
    style,
    children,
}: ModalDialogProps) {
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (open) {
            dialog.removeAttribute('data-closing');
            if (!dialog.open) {
                dialog.showModal();
            }
        } else if (dialog.open) {
            void closeTopLayer(dialog);
        }
    }, [open]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const handleCancel = (e: Event) => {
            e.preventDefault();
            onCloseRef.current();
        };

        const handleClose = () => {
            dialog.removeAttribute('data-closing');
            onCloseRef.current();
        };

        const handleClick = (e: MouseEvent) => {
            if (!closeOnBackdrop || 'closedBy' in HTMLDialogElement.prototype) return;
            if (e.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            const isDialogContent =
                rect.top <= e.clientY &&
                e.clientY <= rect.top + rect.height &&
                rect.left <= e.clientX &&
                e.clientX <= rect.left + rect.width;
            if (isDialogContent) return;
            onCloseRef.current();
        };

        dialog.addEventListener('cancel', handleCancel);
        dialog.addEventListener('close', handleClose);
        dialog.addEventListener('click', handleClick);

        return () => {
            dialog.removeEventListener('cancel', handleCancel);
            dialog.removeEventListener('close', handleClose);
            dialog.removeEventListener('click', handleClick);
        };
    }, [closeOnBackdrop]);

    const variantClass =
        variant === 'drawer'
            ? 'native-dialog-drawer'
            : variant === 'lightbox'
              ? 'native-dialog-lightbox'
              : 'native-dialog-modal';

    return (
        <dialog
            ref={dialogRef}
            {...({ closedby: closeOnBackdrop ? 'any' : 'closerequest' } as Record<string, string>)}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            className={`native-dialog ${variantClass}${className ? ` ${className}` : ''}`}
            style={style}
        >
            {children}
        </dialog>
    );
}
