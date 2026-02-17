import React, { useState, useEffect, useCallback, useRef } from 'react';

type ViewMode = 'pov' | 'braided' | 'editor' | 'notes' | 'analytics';

interface TourStep {
  title: string;
  description: string;
  selector?: string;         // CSS selector for the target element
  requiredView?: ViewMode;   // Switch to this view before highlighting
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

interface TourOverlayProps {
  onComplete: () => void;
  setViewMode: (mode: ViewMode) => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Braidr!',
    description: "Let's take a quick look around. This tour will show you the key features in about a minute.",
  },
  {
    title: 'Outline View',
    description: "This is the Outline view — see one character's story arc with plot point sections and scenes.",
    selector: '.app-sidebar-btn:nth-child(2)',
    requiredView: 'pov',
    position: 'right',
  },
  {
    title: 'Timeline View',
    description: 'The Timeline shows all scenes from every character in reading order. Switch between list, table, and rails layouts.',
    selector: '.app-sidebar-btn:nth-child(3)',
    requiredView: 'pov',
    position: 'right',
  },
  {
    title: 'Editor',
    description: 'The Editor is your full-screen writing space. Pick a scene and start drafting.',
    selector: '.app-sidebar-btn:nth-child(4)',
    requiredView: 'pov',
    position: 'right',
  },
  {
    title: 'Notes',
    description: 'Notes is a wiki-style notebook. Link notes to scenes and each other with [[double brackets]].',
    selector: '.app-sidebar-btn:nth-child(5)',
    requiredView: 'pov',
    position: 'right',
  },
  {
    title: 'Analytics',
    description: 'Track your word count, set goals, and review writing sessions.',
    selector: '.app-sidebar-btn:nth-child(6)',
    requiredView: 'pov',
    position: 'right',
  },
  {
    title: 'Character Selector',
    description: "Switch between characters to see their individual outlines.",
    selector: '.character-selector',
    requiredView: 'pov',
    position: 'bottom',
  },
  {
    title: 'Settings Menu',
    description: 'Find export, tags, fonts, goals, backup, and more in the settings menu.',
    selector: '.settings-menu-container',
    requiredView: 'pov',
    position: 'bottom',
  },
  {
    title: 'Search',
    description: 'Press Cmd+K anytime to search scenes, notes, and tags.',
    selector: '.toolbar-right > .icon-btn:first-child',
    requiredView: 'pov',
    position: 'bottom',
  },
  {
    title: "You're all set!",
    description: 'You can replay this tour anytime from the settings menu. Happy writing!',
  },
];

const PADDING = 8; // px around highlighted element

export default function TourOverlay({ onComplete, setViewMode }: TourOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[currentStep];

  const positionSpotlight = useCallback(() => {
    if (!step.selector) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(step.selector);
    if (el) {
      setSpotlightRect(el.getBoundingClientRect());
    } else {
      setSpotlightRect(null);
    }
  }, [step.selector]);

  // When step changes, switch view if needed and position spotlight
  useEffect(() => {
    if (step.requiredView) {
      setViewMode(step.requiredView);
    }

    if (step.selector) {
      // Delay to allow view to render
      setTransitioning(true);
      const timer = setTimeout(() => {
        positionSpotlight();
        setTransitioning(false);
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setSpotlightRect(null);
      setTransitioning(false);
    }
  }, [currentStep, step.requiredView, step.selector, setViewMode, positionSpotlight]);

  // Reposition on resize
  useEffect(() => {
    const handleResize = () => positionSpotlight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [positionSpotlight]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  // Compute tooltip position with viewport clamping
  const getTooltipStyle = (): React.CSSProperties => {
    if (!spotlightRect) {
      // Centered card (for welcome/done steps)
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const tooltipWidth = 320;
    const tooltipMargin = 16;
    const edgePadding = 16; // minimum distance from viewport edge
    const pos = step.position || 'auto';
    const style: React.CSSProperties = { position: 'fixed' };

    // Determine best position
    let resolvedPos = pos;
    if (pos === 'auto') {
      if (spotlightRect.right + tooltipMargin + tooltipWidth < window.innerWidth) {
        resolvedPos = 'right';
      } else {
        resolvedPos = 'bottom';
      }
    }

    switch (resolvedPos) {
      case 'right':
        style.left = spotlightRect.right + PADDING + tooltipMargin;
        style.top = spotlightRect.top + spotlightRect.height / 2;
        style.transform = 'translateY(-50%)';
        break;
      case 'left':
        style.right = window.innerWidth - spotlightRect.left + PADDING + tooltipMargin;
        style.top = spotlightRect.top + spotlightRect.height / 2;
        style.transform = 'translateY(-50%)';
        break;
      case 'bottom': {
        style.top = spotlightRect.bottom + PADDING + tooltipMargin;
        // Calculate centered left, then clamp to viewport
        let left = spotlightRect.left + spotlightRect.width / 2 - tooltipWidth / 2;
        left = Math.max(edgePadding, Math.min(left, window.innerWidth - tooltipWidth - edgePadding));
        style.left = left;
        break;
      }
      case 'top': {
        style.bottom = window.innerHeight - spotlightRect.top + PADDING + tooltipMargin;
        let left = spotlightRect.left + spotlightRect.width / 2 - tooltipWidth / 2;
        left = Math.max(edgePadding, Math.min(left, window.innerWidth - tooltipWidth - edgePadding));
        style.left = left;
        break;
      }
    }

    return style;
  };

  return (
    <div className="tour-overlay" onClick={(e) => e.stopPropagation()}>
      {/* Semi-transparent backdrop */}
      {spotlightRect ? (
        <div
          className={`tour-spotlight ${transitioning ? 'tour-spotlight--transitioning' : ''}`}
          style={{
            top: spotlightRect.top - PADDING,
            left: spotlightRect.left - PADDING,
            width: spotlightRect.width + PADDING * 2,
            height: spotlightRect.height + PADDING * 2,
          }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}

      {/* Tooltip card */}
      <div
        className={`tour-tooltip ${transitioning ? 'tour-tooltip--hidden' : ''}`}
        style={getTooltipStyle()}
        ref={tooltipRef}
      >
        <div className="tour-tooltip-header">
          <span className="tour-tooltip-step">
            {currentStep + 1} of {TOUR_STEPS.length}
          </span>
        </div>
        <h3 className="tour-tooltip-title">{step.title}</h3>
        <p className="tour-tooltip-desc">{step.description}</p>
        <div className="tour-tooltip-footer">
          <div className="tour-tooltip-dots">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`tour-dot ${i === currentStep ? 'tour-dot--active' : ''} ${i < currentStep ? 'tour-dot--done' : ''}`}
              />
            ))}
          </div>
          <div className="tour-tooltip-actions">
            {currentStep < TOUR_STEPS.length - 1 && (
              <button className="tour-btn-skip" onClick={handleSkip}>
                Skip
              </button>
            )}
            <button className="tour-btn-next" onClick={handleNext}>
              {currentStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
