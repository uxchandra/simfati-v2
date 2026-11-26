/**
 * Background dekoratif bertema manufaktur untuk halaman login.
 * Gaya gambar teknik (blueprint): grid, outline roda gigi, dan garis dimensi.
 * Statis — tanpa animasi. Murni SVG/CSS.
 */

function gearPath(teeth: number, outer: number, inner: number) {
  const step = (Math.PI * 2) / teeth
  const pts: string[] = []
  for (let i = 0; i < teeth; i++) {
    const a = i * step
    const seq: [number, number][] = [
      [a, inner],
      [a + step * 0.15, outer],
      [a + step * 0.45, outer],
      [a + step * 0.6, inner],
    ]
    for (const [ang, r] of seq) {
      pts.push(`${(Math.cos(ang) * r).toFixed(2)},${(Math.sin(ang) * r).toFixed(2)}`)
    }
  }
  return `M${pts.join("L")}Z`
}

/** Roda gigi gaya gambar teknik: outline, lingkaran pitch putus-putus, garis sumbu. */
function GearDrawing({ size, teeth, className }: { size: number; teeth: number; className?: string }) {
  const r = 50
  return (
    <svg
      viewBox="-60 -60 120 120"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d={gearPath(teeth, r, r * 0.84)} strokeWidth={0.6} />
      <circle r={r * 0.75} strokeWidth={0.4} strokeDasharray="3 2" />
      <circle r={r * 0.3} strokeWidth={0.6} />
      <circle r={r * 0.14} strokeWidth={0.4} />
      {/* garis sumbu (center line) */}
      <path d="M-58 0H58M0 -58V58" strokeWidth={0.3} strokeDasharray="8 2 1 2" />
    </svg>
  )
}

export function IndustrialBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* gradasi dasar */}
      <div className="absolute inset-0 bg-linear-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />

      {/* grid blueprint: garis kecil + garis besar */}
      <div
        className="absolute inset-0 text-slate-400/20 dark:text-slate-500/15"
        style={{
          backgroundImage: `
            linear-gradient(currentColor 1px, transparent 1px),
            linear-gradient(90deg, currentColor 1px, transparent 1px),
            linear-gradient(currentColor 1px, transparent 1px),
            linear-gradient(90deg, currentColor 1px, transparent 1px)`,
          backgroundSize: "20px 20px, 20px 20px, 100px 100px, 100px 100px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 80%)",
        }}
      />

      {/* gambar teknik roda gigi */}
      <div className="absolute -left-20 -top-20 text-slate-400/50 dark:text-slate-600/50">
        <GearDrawing size={360} teeth={20} />
      </div>
      <div className="absolute left-[205px] top-[175px] hidden text-slate-400/40 md:block dark:text-slate-600/40">
        <GearDrawing size={150} teeth={10} />
      </div>
      <div className="absolute -bottom-28 -right-24 text-slate-400/50 dark:text-slate-600/50">
        <GearDrawing size={440} teeth={24} />
      </div>

      {/* garis dimensi kecil di pojok — sentuhan "drawing sheet" */}
      <svg
        className="absolute bottom-8 left-8 hidden text-slate-400/60 md:block dark:text-slate-600/60"
        width="180"
        height="40"
        viewBox="0 0 180 40"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path d="M0 8V32M180 8V32M0 20H180" strokeWidth={0.75} />
        <path d="M0 20l8-3v6zM180 20l-8-3v6z" fill="currentColor" stroke="none" />
      </svg>

      {/* vignette halus agar kartu login tetap fokus */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(15,23,42,0.08)_100%)] dark:bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  )
}
