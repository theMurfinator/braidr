import { useEffect, useRef } from 'react';
import { PlotPoint } from '../../shared/types';

interface SectionPickerDropdownProps {
  plotPoints: PlotPoint[];
  previousPlotPointId?: string;
  onSelect: (plotPointId: string) => void;
  onClose: () => void;
}

function SectionPickerDropdown({ plotPoints, previousPlotPointId, onSelect, onClose }: SectionPickerDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const sorted = [...plotPoints].sort((a, b) => a.order - b.order);
  const previousPlotPoint = previousPlotPointId ? plotPoints.find(pp => pp.id === previousPlotPointId) : null;

  return (
    <div className="section-picker-dropdown" ref={ref}>
      <div className="section-picker-header">Move to section</div>
      {previousPlotPoint && (
        <button
          className="section-picker-item section-picker-previous"
          onClick={() => onSelect(previousPlotPoint.id)}
        >
          Previous position ({previousPlotPoint.title})
        </button>
      )}
      {previousPlotPoint && <div className="section-picker-divider" />}
      {sorted.map((pp) => (
        <button
          key={pp.id}
          className="section-picker-item"
          onClick={() => onSelect(pp.id)}
        >
          {pp.title}
        </button>
      ))}
      {sorted.length === 0 && (
        <div className="section-picker-empty">No sections available</div>
      )}
    </div>
  );
}

export default SectionPickerDropdown;
