// settings.jsx — real (localStorage-backed) tweaks hook + in-app Settings popover.
// Replaces the Claude Design host protocol (postMessage to a parent frame) with
// persistence the standalone app actually has. The Tweak* control widgets are
// ported from the design's tweaks-panel.jsx, minus the host/drag plumbing.

const TWEAKS_KEY = 'ebcdic-viewer-tweaks';

function useTweaks(defaults) {
  const [values, setValues] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TWEAKS_KEY) || '{}');
      return { ...defaults, ...saved };
    } catch { return defaults; }
  });
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => {
      const next = { ...prev, ...edits };
      try { localStorage.setItem(TWEAKS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return [values, setTweak];
}

// ── Control styling (ported from tweaks-panel.jsx) ────────────────────────────
const __TWEAKS_STYLE = `
  .twk-pop{display:flex;flex-direction:column;gap:10px}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:var(--twk-faint);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;color:var(--twk-dim)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:var(--twk-faint);font-variant-numeric:tabular-nums}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid var(--twk-border);border-radius:7px;
    background:var(--twk-field-bg);color:inherit;font:inherit;outline:none}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:var(--twk-seg-bg);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:var(--twk-seg-thumb);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:pointer;padding:4px 6px;line-height:1.2;overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:var(--twk-toggle-off);transition:background .15s;cursor:pointer;padding:0;flex-shrink:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:34px;padding:0;border:0;
    border-radius:6px;overflow:hidden;cursor:pointer;
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.06);transition:transform .12s,box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px var(--twk-chip-ring),0 2px 6px rgba(0,0,0,.15)}
  .twk-chip svg{position:absolute;top:50%;left:50%;width:14px;height:14px;transform:translate(-50%,-50%);
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

function TweakSection({ label }) {
  return <div className="twk-sect">{label}</div>;
}

function TweakRow({ label, value, children }) {
  return (
    <div className="twk-row">
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  const maxLen = opts.reduce((m, o) => Math.max(m, o.label.length), 0);
  const fits = maxLen <= ({ 2: 16, 3: 10 }[opts.length] ?? 0);
  if (!fits) {
    const resolve = (s) => {
      const m = opts.find((o) => String(o.value) === s);
      return m === undefined ? s : m.value;
    };
    return <TweakSelect label={label} value={value} options={opts}
                        onChange={(s) => onChange(resolve(s))} />;
  }
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;
  return (
    <TweakRow label={label}>
      <div role="radiogroup" className="twk-seg">
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
                  onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </TweakRow>
  );
}

function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);

function TweakColor({ label, value, options, onChange }) {
  const cur = String(value).toLowerCase();
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((c) => {
          const on = String(c).toLowerCase() === cur;
          return (
            <button key={c} type="button" className="twk-chip" role="radio"
                    aria-checked={on} data-on={on ? '1' : '0'}
                    title={c} style={{ background: c }} onClick={() => onChange(c)}>
              {on && <__TwkCheck light={__twkIsLight(c)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

// ── SettingsPopover ───────────────────────────────────────────────────────────
// A theme-aware popover anchored to the toolbar gear button. Closes on outside
// click or Escape.
function SettingsPopover({ T, open, onClose, children }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  const vars = {
    '--twk-dim': T.textDim, '--twk-faint': T.textFaint,
    '--twk-border': T.borderStrong, '--twk-field-bg': T.panel,
    '--twk-seg-bg': T.panelAlt, '--twk-seg-thumb': T.panel,
    '--twk-toggle-off': T.borderStrong, '--twk-chip-ring': T.text,
  };
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={ref} className="twk-pop" style={{
        position: 'absolute', top: 42, right: 12, zIndex: 1000, width: 260,
        background: T.panel, color: T.text, padding: 14, borderRadius: 12,
        border: `0.5px solid ${T.borderStrong}`,
        boxShadow: '0 12px 40px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.12)',
        fontFamily: SANS, fontSize: 12, ...vars,
      }}>
        {children}
      </div>
    </>
  );
}

Object.assign(window, {
  useTweaks, SettingsPopover,
  TweakSection, TweakRow, TweakToggle, TweakRadio, TweakSelect, TweakColor,
});
