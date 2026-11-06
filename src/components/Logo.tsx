/** Shows the business logo if one is uploaded; renders nothing otherwise. */
export default function Logo({ src, size = 40 }: { src: string | null; size?: number }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ height: size, width: "auto", maxWidth: size * 4 }} className="object-contain" />
  );
}
