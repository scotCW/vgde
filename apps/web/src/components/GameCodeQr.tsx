import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  /** Full URL to encode — usually the game page's own address. */
  value: string;
  size?: number;
  className?: string;
}

/**
 * Fixed light/dark modules regardless of the app's own theme — a QR code
 * needs strong, predictable contrast to scan reliably, so it always
 * renders as black-on-white rather than following light/dark mode.
 */
export default function GameCodeQr({ value, size = 160, className }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) return null;
  return (
    <img
      src={dataUrl}
      alt="QR code to join this game"
      width={size}
      height={size}
      className={`rounded-lg bg-white p-2 ${className ?? ""}`}
    />
  );
}
