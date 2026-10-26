/** A little five-petal flower, used as the folder drag handle. */
export function Flower({ hue, size = 18, className = '' }: { hue: number; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" className={className} aria-hidden>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-5.2" rx="3.6" ry="5.6" fill={`hsl(${hue},62%,74%)`} transform={`rotate(${a})`} />
      ))}
      <circle r="2.3" fill="#fff" opacity=".92" />
    </svg>
  )
}
