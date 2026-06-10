import { useEffect, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { usePerformanceStore } from "../stores/performanceStore";

export function BrandingPanel() {
  const project = useProjectStore((s) => s.project);
  const updateBranding = usePerformanceStore((s) => s.updateBranding);

  const [brandName, setBrandName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [logoText, setLogoText] = useState("");
  const [motto, setMotto] = useState("");
  const [accentHex, setAccentHex] = useState("#ff6b1a");
  const [cyanHex, setCyanHex] = useState("#38d7ff");
  const [magentaHex, setMagentaHex] = useState("#ff4fd8");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setBrandName(project.branding.brand_name);
    setArtistName(project.branding.artist_name);
    setLogoText(project.branding.logo_text);
    setMotto(project.branding.motto);
    setAccentHex(project.branding.theme.accent_hex);
    setCyanHex(project.branding.theme.cyan_hex);
    setMagentaHex(project.branding.theme.magenta_hex);
  }, [project]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">DevolutionDeck Branding</h3>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2 text-[11px]">
        <label className="text-deck-text-muted flex flex-col gap-1">
          Brand Name
          <input
            value={brandName}
            onChange={(event) => setBrandName(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
        </label>
        <label className="text-deck-text-muted flex flex-col gap-1">
          Artist Name
          <input
            value={artistName}
            onChange={(event) => setArtistName(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
        </label>
        <label className="text-deck-text-muted flex flex-col gap-1">
          Logo Text
          <input
            value={logoText}
            onChange={(event) => setLogoText(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
        </label>
        <label className="text-deck-text-muted flex flex-col gap-1">
          Motto
          <input
            value={motto}
            onChange={(event) => setMotto(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
        </label>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2 text-[11px]">
        <p className="text-deck-text-muted uppercase tracking-wide">Theme Accents</p>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-deck-text-muted flex flex-col gap-1">
            Accent
            <input
              type="color"
              value={accentHex}
              onChange={(event) => setAccentHex(event.target.value)}
              className="h-8 rounded border border-deck-border bg-deck-surface"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Cyan
            <input
              type="color"
              value={cyanHex}
              onChange={(event) => setCyanHex(event.target.value)}
              className="h-8 rounded border border-deck-border bg-deck-surface"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Magenta
            <input
              type="color"
              value={magentaHex}
              onChange={(event) => setMagentaHex(event.target.value)}
              className="h-8 rounded border border-deck-border bg-deck-surface"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span style={{ color: accentHex }}>Accent</span>
          <span style={{ color: cyanHex }}>Cyan</span>
          <span style={{ color: magentaHex }}>Magenta</span>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await updateBranding({
              brand_name: brandName,
              artist_name: artistName,
              logo_text: logoText,
              motto,
              theme: {
                ...project.branding.theme,
                accent_hex: accentHex,
                cyan_hex: cyanHex,
                magenta_hex: magentaHex,
              },
            });
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] px-2 py-1 disabled:opacity-50"
      >
        Apply Branding
      </button>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
