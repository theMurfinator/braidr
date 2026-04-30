import { useEffect, useRef } from 'react';
import { PlotPoint } from '../../shared/types';

interface SectionPickerDropdownProps {
  plotPoints: PlotPoint[];
  onSelect: (plotPointId: string) => void;
  onClose: () => void;
}

function SectionPickerDropdown({ plotPoints, onSelect, onClose }: SectionPickerDropdownProps) {
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

  return (
    <div className="section-picker-dropdown" ref={ref}>
      <div className="section-picker-header">Move to section</div>
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
