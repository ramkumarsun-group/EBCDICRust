// app.jsx — EBCDIC Viewer (Tauri build)

const { useState, useMemo, useRef, useEffect, useCallback } = React;

const TWEAK_DEFAULTS = {
  theme: 'light',
  codepage: '037',
  bytesPerRow: 16,
  showAscii: true,
  accent: '#2563eb',
};

// Raw (no-copybook) view renders decoded text; cap how much we lay out so a
// multi-MB file can't freeze the renderer the way the old hex view did.
const MAX_RAW_BYTES = 64 * 1024;

// ─────────────────────────────────────────────────────────────
// Theming
// ─────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg: '#f3f4f6', chrome: '#ebecef', chromeBorder: '#d8dadd',
    panel: '#ffffff', panelAlt: '#f8f9fb',
    border: '#e3e5e9', borderStrong: '#cdd0d5',
    text: '#1c1d21', textDim: '#6b7079', textFaint: '#9aa0a8',
    hexZero: '#c0c4cc', selRow: '#eef3ff',
    typeText: '#2563eb', typeNum: '#b45309', typePacked: '#7c3aed', typeBin: '#0891b2',
    hexBg: '#fcfcfd',
  },
  dark: {
    bg: '#1a1b1f', chrome: '#26282d', chromeBorder: '#34373d',
    panel: '#1f2125', panelAlt: '#181a1d',
    border: '#2c2f35', borderStrong: '#3a3d44',
    text: '#e8eaee', textDim: '#9097a0', textFaint: '#5d626a',
    hexZero: '#4a4d54', selRow: '#1d2640',
    typeText: '#7aa7ff', typeNum: '#f5b461', typePacked: '#c4a4ff', typeBin: '#5ed3e3',
    hexBg: '#16181b',
  },
};

const MONO = '"SF Mono", "JetBrains Mono", "Menlo", "Consolas", monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif';

const typeColor = (T, type) => {
  if (type.includes('COMP-3') || type.includes('PACKED')) return T.typePacked;
  if (type.includes('COMP')) return T.typeBin;
  if (type.includes('PIC 9') || type.includes('PIC S9')) return T.typeNum;
  return T.typeText;
};

const hex2 = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const hex8 = (n) => n.toString(16).padStart(8, '0').toUpperCase();

// ─────────────────────────────────────────────────────────────
// Newline / record-terminator detection
// Splits raw bytes on EBCDIC CR (0x0D), EBCDIC NL (0x15 in CP-1047,
// 0x25 in CP-037), or ASCII LF (0x0A).  Returns an array of
// { start, end } spans (terminator bytes NOT included in the span),
// or null if no recognisable terminators are found.
// ─────────────────────────────────────────────────────────────
// splitOnNewlines(bytes, codepage)
//
// Splits raw bytes on the NL/CR bytes appropriate to the chosen EBCDIC codepage:
//   CP-037 : 0x25 is NL  (do NOT split on 0x15 — it's data in this codepage)
//   CP-1047: 0x15 is NL  (do NOT split on 0x25 — it's data in this codepage)
// CR (0x0D) and ASCII LF (0x0A) are treated as terminators in either codepage.
// Returns an array of { start, end } spans (terminator bytes excluded),
// or null when no terminator bytes are found in the file.
function splitOnNewlines(bytes, codepage) {
  const CR = 0x0D;
  const LF = 0x0A;
  // Choose the NL byte for this codepage only; the other is treated as data.
  // CP-1047 uses 0x15 as NL; all other EBCDIC code pages use 0x25
  const NL = (codepage === '1047') ? 0x15 : 0x25;

  // Quick scan
  let found = false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === CR || b === NL || b === LF) { found = true; break; }
  }
  if (!found) return null;

  const records = [];
  let start = 0, i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let nlLen = 0;
    if (b === CR) {
      // absorb CR+NL or CR+LF as a two-byte terminator
      const nx = i + 1 < bytes.length ? bytes[i + 1] : -1;
      nlLen = (nx === NL || nx === LF) ? 2 : 1;
    } else if (b === NL || b === LF) {
      nlLen = 1;
    }
    if (nlLen) { records.push({ start, end: i }); i += nlLen; start = i; }
    else i++;
  }
  // Trailing content without a terminator (last line with no newline)
  if (start < bytes.length) records.push({ start, end: bytes.length });
  // Drop empty lines (back-to-back terminators)
  return records.filter(r => r.end > r.start);
}

// ─────────────────────────────────────────────────────────────
// Icons (minimal SVG)
// ─────────────────────────────────────────────────────────────
const Icon = ({ d, size = 14, stroke = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
       stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const IFile   = (p) => <Icon {...p} d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" />;
const IFolder = (p) => <Icon {...p} d="M1.5 3.5v9h13v-7h-7l-1.5-2z" />;
const IPrev   = (p) => <Icon {...p} d="M10 3.5L5.5 8l4.5 4.5" />;
const INext   = (p) => <Icon {...p} d="M6 3.5L10.5 8 6 12.5" />;
const IOpen   = (p) => <Icon {...p} d={["M1.5 4.5v8h13v-8", "M1.5 4.5l2-2.5h4l1.5 2h6"]} />;
const IGear   = (p) => <Icon {...p} d={["M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z", "M8 1.5v1.6 M8 12.9v1.6 M14.5 8h-1.6 M3.1 8H1.5 M12.6 3.4l-1.1 1.1 M4.5 11.5l-1.1 1.1 M12.6 12.6l-1.1-1.1 M4.5 4.5L3.4 3.4"]} />;

// ─────────────────────────────────────────────────────────────
// Main app
// ─────────────────────────────────────────────────────────────
function App() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const T = THEMES[tw.theme] || THEMES.light;
  const accent = tw.accent;
  const cp = tw.codepage;
  const bpr = tw.bytesPerRow;

  // Runtime file table — starts with the demo files, grows as the user opens
  // real EBCDIC files through the native dialog.
  const [files, setFiles] = useState(FILES);
  const [copybooks, setCopybooks] = useState(COPYBOOKS);
  const [fileName, setFileName] = useState('EMPLOYEE.DAT');
  const [recordIdx, setRecordIdx] = useState(0);
  const [selField, setSelField] = useState(0);
  const [hoverField, setHoverField] = useState(null);
  const [selOffset, setSelOffset] = useState(null);
  const [viewMode, setViewMode] = useState('records');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layoutWidth, setLayoutWidth] = useState(540);
  const [copybookHeight, setCopybookHeight] = useState(170);
  const [showRedefines, setShowRedefines] = useState(false);

  const startResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = layoutWidth;
    const onMove = (ev) => {
      const next = Math.max(280, Math.min(window.innerWidth - 380, startW + ev.clientX - startX));
      setLayoutWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [layoutWidth]);

  // Vertical resizer between the field list and the copybook-source pane
  // inside LayoutPane. Dragging up grows the source pane; dragging down
  // shrinks it (down to 0, fully collapsed).
  const startCopybookResize = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = copybookHeight;
    const onMove = (ev) => {
      const next = Math.max(0, Math.min(window.innerHeight - 220, startH + startY - ev.clientY));
      setCopybookHeight(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [copybookHeight]);

  const file = files[fileName];
  const cbName = file.copybook;
  const cb = cbName ? copybooks[cbName] : null;
  const hasRedefines = !!(cb && cb.fields.some(f => f.variant));

  // IBM Variable-Blocked (VB) record spans, parsed from the per-record
  // 4-byte RDW headers. Only computed when the per-file recordFormat flag
  // is 'VB' (toggled by the user from the title bar).
  const rdwSpans = useMemo(() => {
    if (file.recordFormat !== 'VB') return null;
    return parseRDWRecords(file.bytes);
  }, [file]);

  // CRLF auto-detection only kicks in when no copybook is bound and we
  // aren't already in VB mode (both of those imply structured records).
  const crlfRecords = useMemo(() => splitOnNewlines(file.bytes, cp), [file, cp]);

  // ODO spans: walk the whole file using dynamic record lengths derived from
  // the control field value inside each record (e.g. NUMBER-OF-ACCTS).
  // Only computed when the copybook has at least one ODO group.
  const odoSpans = useMemo(() => {
    if (!cb || !cb.odoGroups || cb.odoGroups.length === 0) return null;
    return computeODOSpans(file.bytes, cb);
  }, [file, cb]);

  // Effective record spans for navigation / record-mode display.
  // Priority: RDW (VB mode) > ODO dynamic > CRLF auto-detect > fixed-stride.
  const effectiveRecords = rdwSpans || odoSpans || (cb ? null : crlfRecords);
  const currentSpan = effectiveRecords ? (effectiveRecords[recordIdx] ?? null) : null;

  const recordLen = currentSpan
    ? currentSpan.end - currentSpan.start
    : (cb ? cb.recordLength : file.bytes.length);
  const recordCount = effectiveRecords
    ? effectiveRecords.length
    : (cb ? Math.max(1, Math.floor(file.bytes.length / cb.recordLength)) : 1);

  // Records mode is available when a copybook is bound OR record spans exist.
  const effMode = (cb || effectiveRecords) ? viewMode : 'raw';
  const isRaw = effMode === 'raw';

  const viewBytes = isRaw
    ? file.bytes
    : (currentSpan
        ? file.bytes.slice(currentSpan.start, currentSpan.end)
        : file.bytes.slice(recordIdx * cb.recordLength, (recordIdx + 1) * cb.recordLength));
  const viewBase = isRaw
    ? 0
    : (currentSpan ? currentSpan.start : recordIdx * cb.recordLength);

  useEffect(() => { setRecordIdx(0); setSelField(0); setSelOffset(null); }, [fileName, cbName]);
  useEffect(() => { setSelOffset(null); }, [viewMode]);

  const activeField = hoverField !== null ? hoverField : selField;
  const activeFieldObj = (!isRaw && cb) ? cb.fields[activeField] : null;
  const activeRange = activeFieldObj
    ? [activeFieldObj.offset, activeFieldObj.offset + activeFieldObj.length]
    : null;

  const bindCopybook = useCallback((name) => {
    setFiles((prev) => ({ ...prev, [fileName]: { ...prev[fileName], copybook: name } }));
    setViewMode('records');
  }, [fileName]);

  const closeFile = useCallback((name) => {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[name];
      // If the closed file was the active one, switch to the first remaining.
      if (name === fileName) {
        const remaining = Object.keys(next);
        if (remaining.length > 0) setFileName(remaining[0]);
      }
      return next;
    });
  }, [fileName]);

  const toggleRecordFormat = useCallback(() => {
    setFiles((prev) => {
      const f = prev[fileName];
      const next = f.recordFormat === 'VB' ? null : 'VB';
      return { ...prev, [fileName]: { ...f, recordFormat: next } };
    });
    setRecordIdx(0);
    setSelOffset(null);
  }, [fileName]);

  const openFile = useCallback(async () => {
    const res = await window.__TAURI__.invoke('open_file');
    if (!res) return;
    const bytes = b64ToBytes(res.b64);

    // Auto-detect Variable-Blocked format. If the file's prefix bytes parse
    // cleanly as RDW records consuming essentially the whole file, default
    // the format to VB. Otherwise leave as FB. The user can still flip the
    // FB/VB toggle in the title bar after the fact.
    const detected = parseRDWRecords(bytes);
    const recordFormat = (detected && detected.length > 1) ? 'VB' : null;

    setFiles((prev) => ({
      ...prev,
      [res.name]: { copybook: null, bytes, recordFormat },
    }));
    setFileName(res.name);
  }, []);

  const loadCopybook = useCallback(async () => {
    const res = await window.__TAURI__.invoke('open_copybook');
    if (!res) return;
    let parsed;
    try {
      parsed = parseCopybook(res.text, res.name);
    } catch (e) {
      alert('Could not parse copybook:\n' + (e && e.message ? e.message : String(e)));
      return;
    }
    if (!parsed.fields || parsed.fields.length === 0) {
      alert('No fields could be extracted from this copybook. It may use unsupported syntax.');
      return;
    }
    setCopybooks((prev) => ({ ...prev, [res.name]: parsed }));
    // Auto-bind to the currently selected file for instant feedback.
    setFiles((prev) => ({ ...prev, [fileName]: { ...prev[fileName], copybook: res.name } }));
    setViewMode('records');
  }, [fileName]);

  return (
    <div style={{
      width: '100vw', height: '100vh', background: T.panel, color: T.text,
      display: 'flex', flexDirection: 'column', fontFamily: SANS, overflow: 'hidden',
    }}>
      <TitleBar T={T} fileName={fileName} cbName={cbName}
                recordIdx={recordIdx} recordCount={recordCount}
                setRecordIdx={setRecordIdx}
                viewMode={effMode} setViewMode={setViewMode}
                canSwitchMode={!!cb || !!effectiveRecords}
                recordLabel={effectiveRecords && !cb ? 'Line' : 'Record'}
                recordFormat={file.recordFormat || 'FB'}
                onToggleRecordFormat={toggleRecordFormat}
                accent={accent}
                onToggleSettings={() => setSettingsOpen((v) => !v)} />

      <SettingsPopover T={T} open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tw.theme}
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="Accent" value={tw.accent}
          options={['#2563eb', '#dc2626', '#059669', '#d97706']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Hex view" />
        <TweakSelect label="Code page" value={tw.codepage}
          options={[
            { value: '037',  label: 'CP-037  (US/Canada)' },
            { value: '1047', label: 'CP-1047 (Open Systems)' },
            { value: '500',  label: 'CP-500  (International)' },
            { value: '1140', label: 'CP-1140 (US/Canada + €)' },
            { value: '273',  label: 'CP-273  (Germany/Austria)' },
            { value: '285',  label: 'CP-285  (UK)' },
            { value: '297',  label: 'CP-297  (France)' },
          ]}
          onChange={(v) => setTweak('codepage', v)} />
        <TweakRadio label="Bytes / row" value={tw.bytesPerRow}
          options={[{ value: 8, label: '8' }, { value: 16, label: '16' }, { value: 24, label: '24' }]}
          onChange={(v) => setTweak('bytesPerRow', v)} />
        <TweakToggle label="Show ASCII column" value={tw.showAscii}
          onChange={(v) => setTweak('showAscii', v)} />
      </SettingsPopover>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, borderTop: `0.5px solid ${T.chromeBorder}` }}>
        <Sidebar T={T} files={files} fileName={fileName} setFileName={setFileName}
                 cbName={cbName} accent={accent} onBindCopybook={bindCopybook}
                 copybooks={copybooks} onLoadCopybook={loadCopybook}
                 onOpen={openFile} onCloseFile={closeFile} />
        {isRaw ? (
          <ContentPane T={T} file={file} fileName={fileName} cb={cb} cp={cp} accent={accent}
                       crlfRecords={effectiveRecords} />
        ) : (
          <>
            {cb && <LayoutPane T={T} cb={cb} recordBytes={viewBytes} cp={cp}
                        width={layoutWidth}
                        copybookHeight={copybookHeight}
                        onCopybookResizeStart={startCopybookResize}
                        showRedefines={showRedefines}
                        setShowRedefines={setShowRedefines}
                        hasRedefines={hasRedefines}
                        selField={selField} setSelField={setSelField}
                        setHoverField={setHoverField} accent={accent}
                        selOffset={selOffset !== null ? selOffset - viewBase : null} />}
            {cb && <Resizer T={T} onMouseDown={startResize} accent={accent} />}
            <HexPane T={T} bytes={viewBytes} cp={cp} bpr={bpr}
                     showAscii={tw.showAscii}
                     activeRange={activeRange} accent={accent}
                     selOffset={selOffset !== null ? selOffset - viewBase : null}
                     recordBase={viewBase}
                     fields={cb ? cb.fields : []}
                     onByteClick={(offRel) => {
                       const absOff = offRel + viewBase;
                       setSelOffset(absOff);
                       if (cb) {
                         const fi = cb.fields.findIndex(f => offRel >= f.offset && offRel < f.offset + f.length);
                         if (fi >= 0) setSelField(fi);
                       }
                     }} />
          </>
        )}
      </div>

      <StatusBar T={T} file={file} cp={cp} recordIdx={recordIdx}
                 recordCount={recordCount} recordLen={recordLen}
                 selOffset={selOffset} viewMode={effMode} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Title bar (in-app toolbar — native window provides the real chrome)
// ─────────────────────────────────────────────────────────────
function TitleBar({ T, fileName, cbName, recordIdx, recordCount, setRecordIdx, viewMode, setViewMode, canSwitchMode, recordLabel = 'Record', recordFormat = 'FB', onToggleRecordFormat, accent, onToggleSettings }) {
  const btn = {
    height: 24, padding: '0 10px', borderRadius: 6,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: `0.5px solid ${T.borderStrong}`,
    background: T.panel, color: T.text,
    fontSize: 12, fontFamily: SANS, cursor: 'pointer',
  };
  const seg = (active) => ({
    height: 24, padding: '0 10px', fontSize: 11, fontFamily: SANS,
    background: active ? T.text : 'transparent',
    color: active ? T.panel : T.textDim,
    border: 'none', cursor: canSwitchMode ? 'pointer' : 'not-allowed',
    fontWeight: active ? 600 : 500,
    opacity: canSwitchMode ? 1 : 0.5,
  });
  const iconBtn = { ...btn, padding: '0 8px' };
  return (
    <div style={{
      height: 44, background: T.chrome, padding: '0 14px',
      display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, position: 'relative',
    }}>
      {/* App name — left-aligned */}
      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flexShrink: 0 }}>
        EBCDIC Viewer
      </span>

      {/* File + copybook metadata — grows to fill remaining space */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 20,
        overflow: 'hidden',
      }}>
        {/* Divider */}
        <div style={{ width: 1, height: 20, background: T.borderStrong, flexShrink: 0 }} />

        {/* Data File */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: T.textFaint, flexShrink: 0,
            fontFamily: SANS,
          }}>Data File:</span>
          <span style={{
            fontFamily: MONO, fontSize: 12, color: T.text, fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{fileName}</span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: T.borderStrong, flexShrink: 0 }} />

        {/* Copy Book */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: T.textFaint, flexShrink: 0,
            fontFamily: SANS,
          }}>Copy Book:</span>
          <span style={{
            fontFamily: MONO, fontSize: 12,
            color: cbName ? T.text : T.textFaint,
            fontStyle: cbName ? 'normal' : 'italic',
            fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{cbName || 'none'}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onToggleRecordFormat}
          title="IBM Variable-Blocked format — parse a 4-byte RDW (Record Descriptor Word) before each record. Toggle on for VB-format mainframe files."
          style={{
            height: 24, padding: '0 8px', borderRadius: 6,
            border: `0.5px solid ${recordFormat === 'VB' ? accent : T.borderStrong}`,
            background: recordFormat === 'VB' ? accent : T.panel,
            color: recordFormat === 'VB' ? '#fff' : T.textDim,
            fontSize: 10, fontFamily: SANS, fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.06em',
          }}>
          {recordFormat === 'VB' ? 'VB' : 'FB'}
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', borderRadius: 6, overflow: 'hidden',
          border: `0.5px solid ${T.borderStrong}`, background: T.panel,
        }}>
          <button onClick={() => canSwitchMode && setViewMode('records')}
                  style={seg(viewMode === 'records')} disabled={!canSwitchMode}
                  title={canSwitchMode ? '' : 'No copybook bound'}>Records</button>
          <button onClick={() => setViewMode('raw')} style={seg(viewMode === 'raw')}>Raw file</button>
        </div>
        {viewMode === 'records' && (
          <div style={{ display: 'flex', alignItems: 'center', borderRadius: 6, overflow: 'hidden', border: `0.5px solid ${T.borderStrong}` }}>
            <button onClick={() => setRecordIdx(Math.max(0, recordIdx - 1))}
              style={{ ...btn, border: 'none', borderRadius: 0, padding: '0 8px' }}>
              <IPrev size={11} stroke={T.text} />
            </button>
            <div style={{
              padding: '0 10px', fontSize: 11, fontFamily: MONO, color: T.textDim,
              background: T.panel, height: 24, display: 'flex', alignItems: 'center',
              borderLeft: `0.5px solid ${T.borderStrong}`, borderRight: `0.5px solid ${T.borderStrong}`,
            }}>
              {recordLabel} {recordIdx + 1} / {recordCount}
            </div>
            <button onClick={() => setRecordIdx(Math.min(recordCount - 1, recordIdx + 1))}
              style={{ ...btn, border: 'none', borderRadius: 0, padding: '0 8px' }}>
              <INext size={11} stroke={T.text} />
            </button>
          </div>
        )}
        <button onClick={onToggleSettings} style={iconBtn} title="Settings">
          <IGear size={14} stroke={T.text} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────
function Sidebar({ T, files, fileName, setFileName, cbName, accent, onBindCopybook, copybooks, onLoadCopybook, onOpen, onCloseFile }) {
  const groupTitle = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    color: T.textFaint, textTransform: 'uppercase',
    padding: '14px 14px 6px',
  };
  const groupTitleRow = {
    ...groupTitle,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: 10,
  };
  const addBtn = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
    padding: '2px 8px', borderRadius: 4,
    border: `0.5px solid ${accent}`, background: accent, color: '#fff',
    cursor: 'pointer', fontFamily: SANS, textTransform: 'none',
  };
  // Primary, accent-colored button used for the Data files header — opening
  // a data file is the most common entry point so we make it visually loud.
  const addBtnPrimary = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
    padding: '2px 8px', borderRadius: 4,
    border: `0.5px solid ${accent}`, background: accent, color: '#fff',
    cursor: 'pointer', fontFamily: SANS, textTransform: 'none',
  };
  const [hoveredFile, setHoveredFile] = React.useState(null);
  const row = (active) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 10px', margin: '0 6px',
    borderRadius: 5, fontSize: 12, color: T.text,
    background: active ? accent + '22' : 'transparent',
    cursor: 'pointer', fontFamily: MONO,
    position: 'relative',
  });
  return (
    <div style={{
      width: 220, flexShrink: 0, background: T.panelAlt,
      borderRight: `0.5px solid ${T.border}`,
      overflowY: 'auto', paddingBottom: 16,
    }}>
      <div style={groupTitleRow}>
        <span>Data files</span>
        <button onClick={onOpen} style={addBtnPrimary} title="Open an EBCDIC data file">+ Open</button>
      </div>
      {Object.keys(files).map(name => (
        <div key={name}
          style={row(name === fileName)}
          onClick={() => setFileName(name)}
          onMouseEnter={() => setHoveredFile(name)}
          onMouseLeave={() => setHoveredFile(null)}
        >
          <IFile size={13} stroke={name === fileName ? accent : T.textDim} />
          <span style={{
            color: name === fileName ? accent : T.text,
            fontWeight: name === fileName ? 600 : 400,
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{name}</span>
          {hoveredFile === name && (
            <span
              onClick={(e) => { e.stopPropagation(); onCloseFile(name); }}
              title={`Close ${name}`}
              style={{
                marginLeft: 'auto', flexShrink: 0,
                width: 16, height: 16,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 3, fontSize: 13, lineHeight: 1,
                color: T.textDim, background: T.chromeBorder,
                cursor: 'pointer',
              }}
            >×</span>
          )}
        </div>
      ))}
      <div style={groupTitleRow}>
        <span>Copybooks</span>
        <button onClick={onLoadCopybook} style={addBtn} title="Open a .cpy / .cob file">+ Open</button>
      </div>
      {Object.keys(copybooks).map(name => (
        <div key={name} style={row(false)} onClick={() => onBindCopybook(name)} title="Bind to current file">
          <IFile size={13} stroke={T.textDim} />
          <span style={{ color: name === cbName ? T.text : T.textDim }}>{name}</span>
          {name === cbName && <span style={{
            marginLeft: 'auto', fontSize: 9, padding: '1px 5px', borderRadius: 3,
            background: accent + '22', color: accent, fontFamily: SANS, fontWeight: 600,
          }}>BOUND</span>}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Layout (copybook) pane
// ─────────────────────────────────────────────────────────────
function LayoutPane({ T, cb, recordBytes, cp, selField, setSelField, setHoverField, accent, selOffset, width = 540, copybookHeight = 170, onCopybookResizeStart, showRedefines = false, setShowRedefines, hasRedefines = false }) {
  if (!cb) return null;

  // Column widths: [Off, Len, Field, Type, Value]
  const [cols, setCols] = React.useState([52, 44, 160, 150, 160]);

  const startColResize = React.useCallback((colIdx, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = cols[colIdx];
    const onMove = (ev) => {
      const next = Math.max(32, startW + ev.clientX - startX);
      setCols(prev => {
        const c = [...prev];
        c[colIdx] = next;
        return c;
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [cols]);

  // Build the gridTemplateColumns string from state. The last column (Value)
  // is always 1fr so it fills remaining space; the others are fixed px.
  const gridCols = `${cols[0]}px ${cols[1]}px ${cols[2]}px ${cols[3]}px 1fr`;

  // Distinct REDEFINES branch names present in this copybook, in declaration order.
  const variants = [];
  for (const f of cb.fields) {
    if (f.variant && !variants.includes(f.variant)) variants.push(f.variant);
  }
  const variantColor = (idx) => {
    // Soft hue palette for visually distinguishing REDEFINES branches.
    const palette = ['#7c3aed', '#d97706', '#0891b2', '#dc2626', '#059669'];
    return palette[idx % palette.length];
  };

  // Column header labels
  const colLabels = ['Off', 'Len', 'Field', 'Type', 'Value'];

  return (
    <div style={{
      width, flexShrink: 0,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <PaneHeader T={T} icon={<IFolder size={12} stroke={T.textDim} />}
        title="Record layout"
        subtitle={`${cb.name}  ${recordBytes.length} bytes${recordBytes.length !== cb.recordLength ? ` (cb expects ${cb.recordLength})` : ''}`}
        right={hasRedefines && (
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontFamily: SANS, color: T.textDim, cursor: 'pointer',
            userSelect: 'none',
          }} title="Show fields from REDEFINES branches (overlapping byte ranges)">
            <input
              type="checkbox"
              checked={showRedefines}
              onChange={(e) => setShowRedefines && setShowRedefines(e.target.checked)}
              style={{ margin: 0, cursor: 'pointer' }}
            />
            <span>Show REDEFINES</span>
          </label>
        )} />

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'scroll' }}>
        <div style={{ minWidth: 'max-content' }}>

        {/* Column header — inside the scroll container so it scrolls
            horizontally with the data; sticky so it stays pinned vertically. */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols,
          padding: '0 14px', fontSize: 10, fontFamily: SANS, fontWeight: 600,
          color: T.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase',
          borderBottom: `0.5px solid ${T.border}`, background: T.panelAlt,
          userSelect: 'none', position: 'sticky', top: 0, zIndex: 1,
        }}>
          {colLabels.map((label, ci) => (
            <div key={ci} style={{ position: 'relative', padding: '6px 0', paddingRight: 8 }}>
              {label}
              {ci < colLabels.length - 1 && (
                <div
                  onMouseDown={(e) => startColResize(ci, e)}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: 6, cursor: 'col-resize',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <div style={{ width: 1, height: '60%', background: T.borderStrong, borderRadius: 1 }} />
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Resolve ODO fields to only show occurrences that exist in this record */}
        {resolveODOFields(cb, recordBytes).map((f) => {
          const i = cb.fields.indexOf(f); // original index for selField/HexPane sync
          // Hide variant rows when the toggle is off.
          if (f.variant && !showRedefines) return null;
          // Occurrence separator for ODO groups
          const showOccHeader = f.odoGroup !== undefined && f.occurrenceIndex >= 0
            && cb.fields.indexOf(f) === cb.fields.findIndex(
              x => x.odoGroup === f.odoGroup && x.occurrenceIndex === f.occurrenceIndex
            );
          const slice = recordBytes.slice(f.offset, f.offset + f.length);
          const val = decodeField(slice, f);
          const isSel = i === selField;
          const isVariant = !!f.variant;
          const vIdx = isVariant ? variants.indexOf(f.variant) : -1;
          const vColor = isVariant ? variantColor(vIdx) : null;
          const odoGroup = f.odoGroup !== undefined ? cb.odoGroups[f.odoGroup] : null;
          return (
            <React.Fragment key={i}>
              {/* Occurrence separator header */}
              {showOccHeader && odoGroup && (
                <div style={{
                  padding: '4px 14px',
                  fontSize: 10, fontFamily: SANS, fontWeight: 700,
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  color: accent, background: accent + '0D',
                  borderBottom: `0.5px solid ${accent}33`,
                  borderTop: f.occurrenceIndex > 0 ? `1px solid ${accent}44` : 'none',
                }}>
                  {odoGroup.groupName} #{f.occurrenceIndex + 1}
                </div>
              )}
            <div key={`f-${i}`}
              onClick={() => setSelField(i)}
              onMouseEnter={() => setHoverField(i)}
              onMouseLeave={() => setHoverField(null)}
              style={{
                display: 'grid', gridTemplateColumns: gridCols,
                padding: '8px 14px', fontSize: 12,
                cursor: 'pointer', alignItems: 'center',
                background: isSel
                  ? (isVariant ? vColor + '22' : accent + '14')
                  : (isVariant ? vColor + '0A' : 'transparent'),
                borderLeft: `2px solid ${isSel
                  ? (isVariant ? vColor : accent)
                  : (isVariant ? vColor + '55' : 'transparent')}`,
                paddingLeft: 12,
                borderBottom: `0.5px solid ${T.border}`,
                color: T.text,
              }}>
              <div style={{ fontFamily: MONO, color: T.textDim, fontSize: 11 }}>{f.offset}</div>
              <div style={{ fontFamily: MONO, color: T.textDim, fontSize: 11 }}>{f.length}</div>
              <div style={{
                fontWeight: isSel ? 600 : 500, fontFamily: MONO, fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 6,
                minWidth: 0,
              }}>
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  minWidth: 0,
                }} title={f.name}>{f.name}</span>
                {isVariant && (
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: vColor + '22', color: vColor,
                    fontFamily: SANS, fontWeight: 600, letterSpacing: '0.04em',
                    flexShrink: 0,
                  }} title={f.variant}>ALT</span>
                )}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: typeColor(T, f.type) }}>{f.type}</div>
              <div style={{
                fontFamily: MONO, fontSize: 12,
                color: T.text, whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis',
              }} title={val}>
                {f.name === 'FILLER' ? <span style={{ color: T.textFaint, fontStyle: 'italic' }}></span> :
                  (f.type.includes('X') ? `"${val}"` : val)}
              </div>
            </div>
            </React.Fragment>
          );
        })}
        {showRedefines && variants.length > 0 && (
          <div style={{
            padding: '10px 14px', fontSize: 10, fontFamily: SANS, color: T.textFaint,
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
            borderTop: `0.5px solid ${T.border}`, background: T.panelAlt,
          }}>
            <span style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Branches</span>
            {variants.map((v, idx) => (
              <span key={v} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: MONO, fontSize: 10, color: T.textDim,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 2, background: variantColor(idx),
                }} />
                {v}
              </span>
            ))}
          </div>
        )}
        </div>{/* end minWidth:max-content */}
      </div>

      {copybookHeight > 0 && (
        <HorizontalResizer T={T} accent={accent} onMouseDown={onCopybookResizeStart} />
      )}
      <div style={{
        flexShrink: 0, borderTop: copybookHeight > 0 ? 'none' : `0.5px solid ${T.border}`,
        background: T.panelAlt, padding: copybookHeight > 0 ? '10px 14px' : 0,
        height: copybookHeight, overflowY: 'auto',
      }}>
        {copybookHeight > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: T.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>
              Copybook source
            </div>
            <pre style={{
              margin: 0, fontFamily: MONO, fontSize: 11, color: T.textDim,
              lineHeight: 1.55, whiteSpace: 'pre',
            }}>{cb.source}</pre>
          </>
        )}
      </div>
    </div>
  );
}

// Draggable vertical divider between LayoutPane and HexPane.
function Resizer({ T, onMouseDown, accent }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag to resize"
      style={{
        width: 5, flexShrink: 0, cursor: 'col-resize',
        background: hover ? accent : T.border,
        transition: 'background 120ms',
        position: 'relative',
      }}
    >
      {/* Wider invisible hit target so the handle is easy to grab */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: -3, right: -3,
      }} />
    </div>
  );
}

// Draggable horizontal divider — used inside LayoutPane to resize the
// "Copybook source" panel against the field list above it.
function HorizontalResizer({ T, onMouseDown, accent }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag to resize"
      style={{
        height: 5, flexShrink: 0, cursor: 'row-resize',
        background: hover ? accent : T.border,
        transition: 'background 120ms',
        position: 'relative',
      }}
    >
      {/* Wider invisible hit target above and below the visible line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: -3, bottom: -3,
      }} />
    </div>
  );
}

function PaneHeader({ T, icon, title, subtitle, right }) {
  return (
    <div style={{
      height: 38, padding: '0 14px', flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: `0.5px solid ${T.border}`, background: T.panel,
    }}>
      {icon}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11, fontFamily: MONO, color: T.textDim }}>{subtitle}</span>}
      </div>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Content pane (raw mode) — decoded EBCDIC text, no hex
// ─────────────────────────────────────────────────────────────
function ContentPane({ T, file, fileName, cb, cp, accent, crlfRecords }) {
  const wrap = cb ? cb.recordLength : 80;
  // When CRLF records are detected we skip the byte-count truncation guard —
  // each line is individually small, so layout cost is bounded by line count.
  const truncated = !crlfRecords && file.bytes.length > MAX_RAW_BYTES;
  const lines = useMemo(() => {
    const table = getTable(cp);
    // Non-printable bytes (0x00 nulls, control codes, padding inside packed/
    // binary fields) render as the mid-dot · so column structure stays visible.
    // The EBCDIC space 0x40 still decodes to a real ' ' because the lookup
    // table maps it to ASCII 0x20, which is in the printable range.
    const decode = (chunk) => {
      let text = '';
      for (const b of chunk) {
        const c = table[b]; const cc = c.charCodeAt(0);
        text += (cc >= 0x20 && cc <= 0x7E) || cc >= 0xA0 ? c : '·';
      }
      return text;
    };

    if (crlfRecords) {
      // Use the CRLF-detected record spans as line boundaries
      return crlfRecords.map(rec => ({
        offset: rec.start,
        text: decode(file.bytes.slice(rec.start, rec.end)),
      }));
    }

    // Fallback: fixed-width wrap (copybook record length, or 80 chars)
    const limit = Math.min(file.bytes.length, MAX_RAW_BYTES);
    const out = [];
    for (let i = 0; i < limit; i += wrap) {
      out.push({ offset: i, text: decode(file.bytes.slice(i, i + wrap)) });
    }
    return out;
  }, [file, cp, wrap, crlfRecords]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.hexBg }}>
      <PaneHeader T={T}
        icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={T.textDim} strokeWidth="1.5"><path d="M3 2.5h7l3 3v8h-10z M10 2.5v3h3 M5 8h6 M5 10.5h6 M5 5.5h3"/></svg>}
        title="Content"
        subtitle={`${fileName}  ${file.bytes.length} bytes  decoded as CP-${cp}`}
        right={<span style={{ fontSize: 11, fontFamily: MONO, color: T.textFaint }}>
          {crlfRecords
            ? `CRLF-split  ${crlfRecords.length} lines`
            : `wrap @ ${wrap}${cb ? ' (record length)' : ' chars'}`}
        </span>}
      />
      {/* overflowX: scroll forces the horizontal scrollbar to always be
          visible on macOS (which hides overlay scrollbars by default). */}
      <div style={{
        flex: 1, minWidth: 0, minHeight: 0,
        overflowY: 'auto', overflowX: 'scroll',
        padding: '12px 0',
      }}>
        <div style={{ minWidth: 'max-content' }}>
          {lines.map((ln, i) => {
            const isRecordStart = cb && (ln.offset % cb.recordLength === 0);
            const recordNo = cb ? Math.floor(ln.offset / cb.recordLength) + 1 : null;
            return (
              <div key={i} style={{
                display: 'flex', gap: 0, alignItems: 'baseline', padding: '1px 0',
                borderTop: isRecordStart && i > 0 ? `0.5px dashed ${T.border}` : 'none',
                marginTop: isRecordStart && i > 0 ? 6 : 0,
                paddingTop: isRecordStart && i > 0 ? 6 : 1,
              }}>
                <div style={{ width: 90, paddingLeft: 16, flexShrink: 0, fontFamily: MONO, fontSize: 11, color: T.textFaint, userSelect: 'none' }}>
                  {cb ? <span style={{ color: accent }}>#{recordNo}</span> : hex8(ln.offset)}
                </div>
                <pre style={{ margin: 0, fontFamily: MONO, fontSize: 13, color: T.text, lineHeight: 1.55, whiteSpace: 'pre', paddingRight: 16 }}>{ln.text}</pre>
              </div>
            );
          })}
          <div style={{ height: 24 }} />
        </div>
      </div>
      <div style={{
        borderTop: `0.5px solid ${T.border}`, padding: '10px 14px',
        background: T.panelAlt, fontSize: 11, color: T.textFaint, fontFamily: MONO,
        display: 'flex', gap: 16,
      }}>
        <span>EBCDIC  text  non-printable bytes shown as ·</span>
        <div style={{ flex: 1 }} />
        {truncated && <span style={{ color: accent }}>showing first {MAX_RAW_BYTES / 1024} KB of {file.bytes.length.toLocaleString()} B</span>}
        {crlfRecords && <span style={{ color: accent }}>split on CR/LF  {crlfRecords.length} lines</span>}
        {cb && <span>1 line = 1 record ({cb.recordLength} B)</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hex pane
// ─────────────────────────────────────────────────────────────
function HexPane({ T, bytes, cp, bpr, showAscii, activeRange, accent, selOffset, fields, onByteClick, recordBase = 0 }) {
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < bytes.length; i += bpr) {
      out.push({ offset: i, bytes: bytes.slice(i, i + bpr) });
    }
    return out;
  }, [bytes, bpr]);

  const cellW = 22;
  const charW = 11;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.hexBg }}>
      <PaneHeader T={T}
        icon={<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={T.textDim} strokeWidth="1.5"><path d="M2.5 4.5L8 1.5l5.5 3v7L8 14.5l-5.5-3z M2.5 4.5L8 7.5l5.5-3 M8 7.5v7"/></svg>}
        title="Hex"
        subtitle={`CP-${cp}  ${bytes.length} bytes  ${bpr}/row`}
        right={<span style={{ fontSize: 11, fontFamily: MONO, color: T.textFaint }}>
          offset  hex  ebcdic{showAscii ? '  ascii' : ''}
        </span>}
      />
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <div style={{ minWidth: 'max-content' }}>
          <div style={{
            padding: '6px 14px', display: 'flex', gap: 14, fontSize: 10, fontFamily: MONO,
            color: T.textFaint, borderBottom: `0.5px solid ${T.border}`, background: T.panelAlt,
            letterSpacing: '0.04em', position: 'sticky', top: 0, zIndex: 1,
          }}>
            <div style={{ width: 72 }}>Offset</div>
            <div style={{ width: cellW * bpr }}>
              {Array.from({ length: bpr }, (_, i) => (
                <span key={i} style={{ display: 'inline-block', width: cellW, textAlign: 'center', color: i % 4 === 0 ? T.textDim : T.textFaint }}>{hex2(i)}</span>
              ))}
            </div>
            <div style={{ width: charW * bpr, textAlign: 'left' }}>EBCDIC</div>
            {showAscii && <div style={{ width: charW * bpr }}>ASCII</div>}
          </div>
          <div style={{ padding: '4px 0' }}>
            {rows.map(r => (
              <HexRow key={r.offset} T={T} row={r} bpr={bpr} cellW={cellW} charW={charW}
                      cp={cp} showAscii={showAscii} activeRange={activeRange}
                      accent={accent} selOffset={selOffset} onByteClick={onByteClick}
                      recordBase={recordBase} fields={fields} />
            ))}
          </div>
        </div>
      </div>
      <ByteDetail T={T} bytes={bytes} offset={selOffset} cp={cp} accent={accent}
                  fields={fields} recordBase={recordBase} />
    </div>
  );
}

function HexRow({ T, row, bpr, cellW, charW, cp, showAscii, activeRange, accent, selOffset, onByteClick, fields, recordBase = 0 }) {
  const inRange = (off) => activeRange && off >= activeRange[0] && off < activeRange[1];
  const fieldStarts = new Set(fields.map(f => f.offset));

  return (
    <div style={{ display: 'flex', gap: 14, padding: '2px 14px', fontFamily: MONO, fontSize: 12, lineHeight: '20px', alignItems: 'center' }}>
      <div style={{ width: 72, color: T.textDim, fontSize: 11 }}>{hex8(row.offset + recordBase)}</div>
      <div style={{ width: cellW * bpr, display: 'flex' }}>
        {[...row.bytes].map((b, i) => {
          const off = row.offset + i;
          const sel = off === selOffset;
          const high = inRange(off);
          const isFieldStart = fieldStarts.has(off) && off !== 0;
          return (
            <span key={i} onClick={() => onByteClick(off)} style={{
              display: 'inline-block', width: cellW, textAlign: 'center',
              background: sel ? accent : (high ? accent + '22' : 'transparent'),
              color: sel ? '#fff' : (high ? T.text : (b === 0 ? T.hexZero : T.text)),
              borderRadius: 3, cursor: 'pointer',
              borderLeft: isFieldStart ? `1px solid ${accent}66` : '1px solid transparent',
            }}>{hex2(b)}</span>
          );
        })}
      </div>
      <div style={{ width: charW * bpr, display: 'flex', fontFamily: MONO, fontSize: 13 }}>
        {[...row.bytes].map((b, i) => {
          const off = row.offset + i;
          const high = inRange(off);
          const sel = off === selOffset;
          return (
            <span key={i} onClick={() => onByteClick(off)} style={{
              display: 'inline-block', width: charW, textAlign: 'center',
              background: sel ? accent : (high ? accent + '22' : 'transparent'),
              color: sel ? '#fff' : T.text, borderRadius: 2, cursor: 'pointer',
            }}>{ebcdicChar(b, cp)}</span>
          );
        })}
      </div>
      {showAscii && (
        <div style={{ width: charW * bpr, display: 'flex', fontFamily: MONO, fontSize: 13 }}>
          {[...row.bytes].map((b, i) => {
            const off = row.offset + i;
            const high = inRange(off);
            return (
              <span key={i} style={{ display: 'inline-block', width: charW, textAlign: 'center', color: high ? T.text : T.textFaint }}>{asciiChar(b)}</span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ByteDetail({ T, bytes, offset, cp, accent, fields, recordBase = 0 }) {
  if (offset === null || offset >= bytes.length) {
    return (
      <div style={{
        borderTop: `0.5px solid ${T.border}`, padding: '10px 14px',
        background: T.panelAlt, fontSize: 11, color: T.textFaint, fontFamily: MONO,
      }}>Click a byte to inspect.</div>
    );
  }
  const b = bytes[offset];
  const f = fields.find(f => offset >= f.offset && offset < f.offset + f.length);
  const bin = b.toString(2).padStart(8, '0');
  const absOff = offset + recordBase;
  const item = (label, val, mono = true, color) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: T.textFaint, textTransform: 'uppercase', fontFamily: SANS }}>{label}</span>
      <span style={{ fontFamily: mono ? MONO : SANS, fontSize: 12, color: color || T.text }}>{val}</span>
    </div>
  );
  return (
    <div style={{
      borderTop: `0.5px solid ${T.border}`, padding: '10px 14px',
      background: T.panelAlt, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
    }}>
      {item('Offset', hex8(absOff) + '  (' + absOff + ')')}
      {item('Hex', '0x' + hex2(b), true, accent)}
      {item('Bin', bin.slice(0, 4) + ' ' + bin.slice(4))}
      {item('Dec', String(b))}
      {item('EBCDIC', '"' + ebcdicChar(b, cp) + '"')}
      {item('ASCII', '"' + asciiChar(b) + '"')}
      {f && item('Field', f.name + '  +' + (offset - f.offset))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function StatusBar({ T, file, cp, recordIdx, recordCount, recordLen, selOffset, viewMode }) {
  const seg = (label, val) => (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span style={{ color: T.textFaint }}>{label}</span>
      <span style={{ color: T.text, fontFamily: MONO }}>{val}</span>
    </span>
  );
  return (
    <div style={{
      height: 28, background: T.chrome, borderTop: `0.5px solid ${T.chromeBorder}`,
      display: 'flex', alignItems: 'center', gap: 24, padding: '0 14px',
      fontSize: 11, color: T.textDim, flexShrink: 0,
    }}>
      {seg('Mode', viewMode === 'raw' ? 'Raw file' : 'Records')}
      {seg('CP', cp)}
      {seg('File size', file.bytes.length + ' B')}
      {viewMode === 'records' && seg('Record', `${recordLen} B × ${recordCount}`)}
      {seg('Sel', selOffset !== null ? hex8(selOffset) : '')}
      <div style={{ flex: 1 }} />
      <span style={{ color: T.textFaint }}>Read-only</span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
