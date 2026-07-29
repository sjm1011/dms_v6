'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_DELAY_MS = 250;
const TOOLTIP_ID = 'dms-global-tooltip';
const TOOLTIP_GAP_PX = 12;
const VIEWPORT_MARGIN_PX = 8;

interface TooltipState {
  target: HTMLElement;
  content: string;
  anchor: 'pointer' | 'target';
}

const getTooltipTarget = (eventTarget: EventTarget | null): HTMLElement | null => {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  return eventTarget.closest<HTMLElement>('[data-tooltip]');
};

export const TooltipHost: React.FC = () => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const pendingTargetRef = useRef<HTMLElement | null>(null);
  const pendingAnchorRef = useRef<TooltipState['anchor']>('target');
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const originalDescribedByRef = useRef<string | null>(null);
  const pointerPositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let lastInteractionWasTouch = false;

    const clearShowTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      pendingTargetRef.current = null;
    };

    const restoreActiveTarget = () => {
      const activeTarget = activeTargetRef.current;
      if (!activeTarget) {
        return;
      }

      if (originalDescribedByRef.current === null) {
        activeTarget.removeAttribute('aria-describedby');
      } else {
        activeTarget.setAttribute('aria-describedby', originalDescribedByRef.current);
      }

      activeTargetRef.current = null;
      originalDescribedByRef.current = null;
    };

    const hideTooltip = () => {
      clearShowTimer();
      restoreActiveTarget();
      setTooltip(null);
    };

    const scheduleTooltip = (target: HTMLElement, anchor: TooltipState['anchor']) => {
      const content = target.dataset.tooltip?.trim();
      if (!content || activeTargetRef.current === target) {
        return;
      }

      if (pendingTargetRef.current === target) {
        pendingAnchorRef.current = anchor;
        return;
      }

      clearShowTimer();
      restoreActiveTarget();
      setTooltip(null);
      pendingTargetRef.current = target;
      pendingAnchorRef.current = anchor;

      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;

        if (pendingTargetRef.current !== target || !target.isConnected) {
          pendingTargetRef.current = null;
          return;
        }

        const currentContent = target.dataset.tooltip?.trim();
        pendingTargetRef.current = null;
        if (!currentContent) {
          return;
        }

        const originalDescribedBy = target.getAttribute('aria-describedby');
        originalDescribedByRef.current = originalDescribedBy;
        activeTargetRef.current = target;
        target.setAttribute(
          'aria-describedby',
          originalDescribedBy ? `${originalDescribedBy} ${TOOLTIP_ID}` : TOOLTIP_ID
        );
        setTooltip({ target, content: currentContent, anchor: pendingAnchorRef.current });
      }, TOOLTIP_DELAY_MS);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') {
        pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      }
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        return;
      }

      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      const target = getTooltipTarget(event.target);
      if (!target) {
        return;
      }

      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) {
        return;
      }

      scheduleTooltip(target, 'pointer');
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        return;
      }

      const target = getTooltipTarget(event.target);
      if (!target) {
        return;
      }

      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) {
        return;
      }

      if (pendingTargetRef.current === target || activeTargetRef.current === target) {
        hideTooltip();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (lastInteractionWasTouch) {
        return;
      }

      const target = getTooltipTarget(event.target);
      if (target) {
        scheduleTooltip(target, 'target');
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      const target = getTooltipTarget(event.target);
      if (!target) {
        return;
      }

      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) {
        return;
      }

      if (pendingTargetRef.current === target || activeTargetRef.current === target) {
        hideTooltip();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      lastInteractionWasTouch = event.pointerType === 'touch';
      hideTooltip();
    };

    const handleKeyDown = () => {
      lastInteractionWasTouch = false;
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', hideTooltip, true);
      window.removeEventListener('resize', hideTooltip);
      clearShowTimer();
      restoreActiveTarget();
    };
  }, []);

  useLayoutEffect(() => {
    const tooltipElement = tooltipRef.current;
    if (!tooltipElement || !tooltip) {
      return;
    }

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const maximumLeft = Math.max(
      VIEWPORT_MARGIN_PX,
      window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN_PX
    );
    const maximumTop = Math.max(
      VIEWPORT_MARGIN_PX,
      window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN_PX
    );
    let left: number;
    let top: number;

    if (tooltip.anchor === 'pointer') {
      const { x, y } = pointerPositionRef.current;
      const rightSideLeft = x + TOOLTIP_GAP_PX;
      left = rightSideLeft + tooltipRect.width <= window.innerWidth - VIEWPORT_MARGIN_PX
        ? rightSideLeft
        : x - tooltipRect.width - TOOLTIP_GAP_PX;
      top = y + TOOLTIP_GAP_PX;
    } else {
      const targetRect = tooltip.target.getBoundingClientRect();
      const rightSideLeft = targetRect.right + TOOLTIP_GAP_PX;
      left = rightSideLeft + tooltipRect.width <= window.innerWidth - VIEWPORT_MARGIN_PX
        ? rightSideLeft
        : targetRect.left - tooltipRect.width - TOOLTIP_GAP_PX;
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
    }

    left = Math.min(Math.max(left, VIEWPORT_MARGIN_PX), maximumLeft);
    top = Math.min(Math.max(top, VIEWPORT_MARGIN_PX), maximumTop);

    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
    tooltipElement.style.visibility = 'visible';
  }, [tooltip]);

  if (!tooltip || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      id={TOOLTIP_ID}
      className="dms-tooltip"
      role="tooltip"
    >
      {tooltip.content}
    </div>,
    document.body
  );
};
