interface BullWiserLogoProps {
  className?: string;
}

export function BullWiserLogo({ className = "w-10 h-10" }: BullWiserLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="BullWiser Logo"
      className={`object-contain ${className}`}
    />
  );
}

// Larger version used on the landing page
export function BullWiserLogoLarge({ className = "w-24 h-24" }: BullWiserLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="BullWiser Logo"
      className={`object-contain ${className}`}
    />
  );
}
