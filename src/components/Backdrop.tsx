const IMAGES = ["/hero-tent.svg", "/bg-flowers.svg", "/bg-night.svg", "/bg-mandap.svg"];
const SECONDS = 8; // time each picture is shown

/** Colourful pictures that fade into each other behind the page. `soft` lightens them for pages with a lot of text. */
export default function Backdrop({ soft = false }: { soft?: boolean }) {
  const total = IMAGES.length * SECONDS;
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-slate-100">
      <style>{`@keyframes bgfade{0%{opacity:0}6%{opacity:1}25%{opacity:1}31%{opacity:0}100%{opacity:0}}
@media (prefers-reduced-motion: reduce){.bgslide{animation:none!important}.bgslide:first-child{opacity:1!important}}
@media (max-width: 767px){.bgslide{animation:none!important}.bgslide:not(:first-child){display:none}.bgslide:first-child{opacity:1!important}}`}</style>
      {IMAGES.map((src, i) => (
        <div
          key={src}
          className="bgslide absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${src})`, opacity: i === 0 ? 1 : 0, animation: `bgfade ${total}s infinite`, animationDelay: `${i * SECONDS - (i === 0 ? 0 : 0)}s` }}
        />
      ))}
      <div className={`absolute inset-0 ${soft ? "bg-white/75" : "bg-black/45"}`} />
    </div>
  );
}
