import React from 'react';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  prefix?: string;
  suffix?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({ 
  value, 
  onChange, 
  className = "", 
  placeholder = "", 
  disabled = false,
  prefix = "",
  suffix = ""
}) => {
  // Định dạng hiển thị: 1000000 -> "1,000,000"
  const formatDisplay = (num: number) => {
    if (num === 0) return '';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Chuyển đổi ngược: "1,000,000" -> 1000000
  const parseValue = (str: string) => {
    const cleanStr = str.replace(/,/g, '');
    const num = parseInt(cleanStr, 10);
    return isNaN(num) ? 0 : num;
  };

  const [displayValue, setDisplayValue] = React.useState(formatDisplay(value));

  // Đồng bộ khi value từ props thay đổi
  React.useEffect(() => {
    setDisplayValue(formatDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    // Chỉ cho phép nhập số và dấu phẩy
    const cleanValue = rawValue.replace(/[^0-9]/g, '');
    const num = parseValue(cleanValue);
    
    onChange(num);
    setDisplayValue(formatDisplay(num));
  };

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`${className} ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-7' : ''}`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
          {suffix}
        </span>
      )}
    </div>
  );
};
