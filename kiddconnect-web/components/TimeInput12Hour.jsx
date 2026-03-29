'use client';

import { useState, useEffect } from 'react';
import { to12Hour, to24Hour } from '@/lib/timeFormatter';

/**
 * Time input component that displays and handles 12-hour format
 * Internally stores in 24-hour format for compatibility with backend
 */
export default function TimeInput12Hour({ value, onChange, className = '', disabled = false }) {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Convert 24-hour to 12-hour for display
  useEffect(() => {
    if (value) {
      setDisplayValue(to12Hour(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);
    
    // Try to convert to 24-hour format
    const time24 = to24Hour(inputValue);
    if (time24 && time24.match(/^\d{2}:\d{2}$/)) {
      onChange(time24);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Validate and format on blur
    if (displayValue) {
      const time24 = to24Hour(displayValue);
      if (time24 && time24.match(/^\d{2}:\d{2}$/)) {
        setDisplayValue(to12Hour(time24));
        onChange(time24);
      } else {
        // Invalid format, revert to last valid value
        setDisplayValue(value ? to12Hour(value) : '');
      }
    }
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      placeholder="9:00 AM"
      className={className}
      disabled={disabled}
      pattern="[0-9]{1,2}:[0-9]{2}\s*(AM|PM|am|pm)"
      title="Enter time in 12-hour format (e.g., 9:00 AM)"
    />
  );
}

