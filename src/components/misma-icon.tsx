type MismaIconProps = {
  size?: number;
  className?: string;
};

export function MismaIcon({ size = 28, className }: MismaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="50" fill="#080b10" />
      <polyline
        points="17,48 32,63 56,36"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="37,48 52,63 76,36"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
