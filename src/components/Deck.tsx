import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DECK, type Question } from '../data/deck';

type Kind = 'cover' | 'hero' | 'kw' | 'copy' | 'matrix' | 'bench' | 'madre' | 'end';
interface Step { kind: Kind; qi?: number; mi?: number; phases: number }

const KIND_LABEL: Record<Kind, string> = {
  cover: 'Portada', hero: 'Pregunta', kw: 'De la pregunta a la cadena', copy: 'Búsqueda en vivo',
  matrix: 'Matriz de enfrentamiento', bench: 'Benchmarking', madre: 'Paper madre', end: 'Cierre',
};
const LETTERS = 'ABCDEFGH';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const W = 1600, H = 900;

const fmtDate = (iso: string) => { const a = iso.split('-').map(Number); return `${a[2]} ${MONTHS[a[1] - 1]} ${a[0]}`; };
const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',') + ' %';
const num = (x: number) => x.toFixed(2).replace('.', ',');
const orGroup = (terms: string[]) => '( ' + terms.join(' OR ') + ' )';
const plainQuestion = (src: string) => src.replace(/\[([^\]|]+)\|\d+\]/g, '$1');

interface Seg { text: string; kw: boolean; block?: number; key?: string }
function parseQuestion(src: string): Seg[] {
  const out: Seg[] = []; const re = /\[([^\]|]+)\|(\d+)\]/g; let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), kw: false });
    out.push({ text: m[1], kw: true, block: Number(m[2]), key: 'k' + k++ });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: src.slice(last), kw: false });
  return out;
}

/** Pesos de la matriz de enfrentamiento: cada criterio gana a todos los que están debajo. */
function weights(q: Question) {
  const n = q.criteria.length; const total = (n * (n - 1)) / 2;
  const M = q.criteria.map((_, r) => q.criteria.map((__, c) => (r === c ? null : c > r ? 1 : 0)));
  const subs = M.map((row) => row.reduce<number>((a, x) => a + (x || 0), 0));
  return { M, subs, total, w: subs.map((s) => s / total) };
}
const scoreOf = (scores: number[], w: number[]) => scores.reduce((a, s, i) => a + s * w[i], 0);

function buildSteps(): Step[] {
  const s: Step[] = [{ kind: 'cover', phases: 1 }];
  DECK.questions.forEach((q, qi) => {
    s.push({ kind: 'hero', qi, phases: 2 });
    s.push({ kind: 'kw', qi, phases: 5 });
    s.push({ kind: 'copy', qi, phases: 1 });
    s.push({ kind: 'matrix', qi, phases: 4 });
    s.push({ kind: 'bench', qi, phases: 4 });
    q.mothers.forEach((_, mi) => s.push({ kind: 'madre', qi, mi, phases: 1 }));
  });
  s.push({ kind: 'end', phases: 1 });
  return s;
}

type Fly = 'static' | 'measure' | 'from' | 'go' | 'none';

export default function Deck() {
  const steps = useMemo(buildSteps, []);
  const qs = DECK.questions;
  const fromHash = useCallback(() => {
    const m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
    if (!m) return { i: 0, p: 0 };
    const ni = Math.min(steps.length - 1, Number(m[1]));
    return { i: ni, p: Math.min(steps[ni].phases - 1, Number(m[2] || 0)) };
  }, [steps]);
  const [pos, setPos] = useState(fromHash);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState<number | 'fail' | null>(null);
  const [index, setIndex] = useState(false);
  const [fly, setFly] = useState<Fly>('static');
  const [flyOff, setFlyOff] = useState<Record<string, [number, number, number]>>({});
  const [scale, setScale] = useState(1);

  const rootRef = useRef<HTMLDivElement>(null);
  const segEls = useRef<Record<string, HTMLSpanElement | null>>({});
  const chipEls = useRef<Record<string, HTMLSpanElement | null>>({});
  const flySrc = useRef<Record<string, DOMRect>>({});
  const copyTimer = useRef<number | undefined>(undefined);

  const { i, p } = pos; const st = steps[i];
  const q = st.qi != null ? qs[st.qi] : null;

  // Escala el lienzo 1600×900 al tamaño de la ventana.
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Recuerda la posición al recargar.
  useEffect(() => {
    const onHash = () => setPos((cur) => { const h = fromHash(); return h.i === cur.i && h.p === cur.p ? cur : h; });
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [fromHash]);
  useEffect(() => { history.replaceState(null, '', `#${i}.${p}`); }, [i, p]);

  const go = useCallback((ni: number, np = 0) => {
    ni = Math.max(0, Math.min(steps.length - 1, ni));
    setPos({ i: ni, p: np }); setCopied(null); setIndex(false); setFly('static'); setFlyOff({}); setTab(0);
  }, [steps.length]);
  const jumpQ = useCallback((qi: number) => { const idx = steps.findIndex((x) => x.qi === qi); if (idx >= 0) go(idx); }, [steps, go]);

  const next = useCallback(() => {
    setIndex(false);
    if (p < st.phases - 1) {
      if (st.kind === 'kw' && p === 1) {
        const src: Record<string, DOMRect> = {}; let ok = false;
        Object.entries(segEls.current).forEach(([k, el]) => { if (el?.isConnected) { src[k] = el.getBoundingClientRect(); ok = true; } });
        flySrc.current = src; setFlyOff({}); setFly(ok ? 'measure' : 'none'); setPos({ i, p: 2 });
        return;
      }
      setPos({ i, p: p + 1 });
    } else if (i < steps.length - 1) go(i + 1);
  }, [i, p, st, steps.length, go]);

  const prev = useCallback(() => {
    if (p > 0) { setPos({ i, p: p - 1 }); setFly('static'); }
    else if (i > 0) go(i - 1, steps[i - 1].phases - 1);
  }, [i, p, steps, go]);

  // FLIP: las palabras clave vuelan desde la pregunta a su bloque.
  useLayoutEffect(() => {
    if (fly === 'measure') {
      const s = scale || 1; const off: Record<string, [number, number, number]> = {};
      Object.entries(flySrc.current).forEach(([k, src]) => {
        const el = chipEls.current[k]; if (!el) return;
        const d = el.getBoundingClientRect();
        off[k] = [(src.left - d.left) / s, (src.top - d.top) / s, d.width ? src.width / d.width : 1];
      });
      setFlyOff(off); setFly('from');
    } else if (fly === 'from') {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setFly((f) => (f === 'from' ? 'go' : f))));
      return () => cancelAnimationFrame(id);
    }
  }, [fly, scale]);

  const doCopy = useCallback((text: string, idx: number) => {
    const done = () => {
      setCopied(idx); window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 2400);
    };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove();
        if (ok) done(); else setCopied('fail');
      } catch { setCopied('fail'); }
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key; const t = e.target as HTMLElement | null;
      if ((k === ' ' || k === 'Enter') && t && (t.tagName === 'BUTTON' || t.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(k)) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
      else if (/^[1-9]$/.test(k) && Number(k) <= qs.length) { e.preventDefault(); jumpQ(Number(k) - 1); }
      else if (k === 'Escape') { e.preventDefault(); setIndex((x) => !x); }
      else if (k === 'Home') { e.preventDefault(); go(0); }
      else if (k === 'End') { e.preventDefault(); go(steps.length - 1); }
      else if (k === 'c' && st.kind === 'copy' && q) { e.preventDefault(); doCopy(q.databases[tab].query, tab); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, jumpQ, go, steps.length, qs.length, st.kind, q, tab, doCopy]);

  // Progreso
  let tot = 0, cur = 0;
  steps.forEach((x, k) => { if (k < i) cur += x.phases; tot += x.phases; });
  cur += p + 1;
  const qSteps = q ? steps.filter((x) => x.qi === st.qi) : [];

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <div ref={rootRef} style={{ width: W, height: H, flex: 'none', transform: `scale(${scale})`, position: 'relative', overflow: 'hidden', background: '#FFFFFF', color: '#1C211E', fontFamily: "'Tinos', 'Times New Roman', Times, serif", display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 72, flex: 'none', display: 'flex', alignItems: 'center', gap: 24, padding: '0 40px', borderBottom: '1px solid #D9DDDA' }}>
          <button type="button" onClick={() => go(0)} style={{ font: 'inherit', fontSize: 20, fontWeight: 700, background: 'none', border: 0, cursor: 'pointer', color: '#1C211E', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 4, background: '#1F6B45', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>EA</span>
            Estado del arte
          </button>
          <nav aria-label="Preguntas" style={{ display: 'flex', gap: 2, marginLeft: 20, alignSelf: 'stretch' }}>
            {qs.map((qq, k) => (
              <button key={qq.id} type="button" className={'qtab' + (st.qi === k ? ' on' : '')} onClick={() => jumpQ(k)} title={qq.short}>{qq.id}</button>
            ))}
          </nav>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 260 }}>
            <div style={{ fontSize: 17, color: '#2B322E' }}>
              <b>{(q ? q.id + ' · ' : '') + KIND_LABEL[st.kind]}</b>{' '}
              <span style={{ color: '#59615C' }}>{q ? `Paso ${qSteps.indexOf(st) + 1} / ${qSteps.length}` : ''}</span>
            </div>
            {st.phases > 1 && (
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: st.phases }, (_, k) => <span key={k} className={'dot' + (k <= p ? ' on' : '')} />)}
              </div>
            )}
          </div>
          <button type="button" className="ghostbtn" onClick={() => setIndex((x) => !x)}>Índice <kbd>Esc</kbd></button>
        </header>

        <main style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <div key={'s' + i} style={{ position: 'absolute', inset: 0 }}>
            {st.kind === 'cover' && <Cover />}
            {st.kind === 'hero' && q && <Hero q={q} qi={st.qi!} p={p} />}
            {st.kind === 'kw' && q && (
              <Keywords q={q} p={p} fly={fly} flyOff={flyOff}
                segRef={(k) => (el) => { segEls.current[k] = el; }}
                chipRef={(k) => (el) => { chipEls.current[k] = el; }} />
            )}
            {st.kind === 'copy' && q && <Copy q={q} tab={tab} setTab={(t) => { setTab(t); setCopied(null); }} copied={copied} onCopy={doCopy} />}
            {st.kind === 'matrix' && q && <Matrix q={q} p={p} />}
            {st.kind === 'bench' && q && <Bench q={q} p={p} />}
            {st.kind === 'madre' && q && <Madre q={q} mi={st.mi!} />}
            {st.kind === 'end' && <End />}
          </div>

          {index && (
            <div onClick={() => setIndex(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(20, 26, 22, 0.38)', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 28 }}>
              <div className="a-up" onClick={(e) => e.stopPropagation()} style={{ width: 1240, maxHeight: 720, overflow: 'auto', background: '#FFFFFF', border: '1px solid #C4CAC6', boxShadow: '0 18px 48px rgba(0, 0, 0, 0.18)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '1px solid #D9DDDA', position: 'sticky', top: 0, background: '#FFFFFF' }}>
                  <div><div style={{ fontSize: 27, fontWeight: 700 }}>Índice general</div><div style={{ fontSize: 16, color: '#59615C' }}>Teclas 1–5 saltan a cada pregunta · Esc cierra</div></div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" className="ghostbtn" onClick={() => go(0)}>Portada</button>
                    <button type="button" className="ghostbtn" onClick={() => go(steps.length - 1)}>Cierre</button>
                    <button type="button" className="navbtn" aria-label="Cerrar índice" onClick={() => setIndex(false)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                </div>
                {qs.map((qq, k) => (
                  <div key={qq.id} style={{ display: 'flex', gap: 22, padding: '20px 28px', borderBottom: '1px solid #E3E6E4' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#59615C', width: 34, flex: 'none' }}>{qq.id}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button type="button" className="ititle" onClick={() => jumpQ(k)}>{plainQuestion(qq.question)}</button>
                      <div style={{ fontSize: 15, color: '#59615C', margin: '6px 0 10px' }}>{qq.short} · {qq.blocks.length} bloques · {qq.mothers.length} papers madre</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {steps.map((x, si) => ({ x, si })).filter((e) => e.x.qi === k).map((e) => (
                          <button key={e.si} type="button" className={'istep' + (e.si === i ? ' on' : '')} onClick={() => go(e.si)}>
                            {e.x.kind === 'madre' ? 'Madre ' + (e.x.mi! + 1) : KIND_LABEL[e.x.kind]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        <footer style={{ height: 56, flex: 'none', position: 'relative', display: 'flex', alignItems: 'center', gap: 22, padding: '0 40px', borderTop: '1px solid #E3E6E4', fontSize: 16, color: '#59615C' }}>
          <div style={{ position: 'absolute', left: 0, top: -1, height: 3, background: '#1F6B45', transition: 'width 0.45s cubic-bezier(.2,.7,.2,1)', width: `${(cur / tot) * 100}%` }} />
          <span>{DECK.meta.presenters.join(' · ')}</span>
          <div style={{ flex: 1 }} />
          <span><kbd>←</kbd> <kbd>→</kbd> navegar</span><span><kbd>1</kbd>–<kbd>5</kbd> preguntas</span><span><kbd>Esc</kbd> índice</span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 10 }}>
            <button type="button" className="navbtn" aria-label="Anterior" onClick={prev}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" className="navbtn" aria-label="Siguiente" onClick={next}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ================= Diapositivas ================= */

function Cover() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 120px' }}>
      <div className="eyebrow a-in">Revisión sistemática · Scopus · Web of Science · IEEE Xplore</div>
      <h1 className="a-up d1" style={{ fontSize: 104, margin: '20px 0 0', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em' }}>Estado del arte</h1>
      <p className="a-up d2" style={{ fontSize: 36, margin: '22px 0 0', color: '#38403B', maxWidth: 1150, lineHeight: 1.3 }}>{DECK.meta.subtitle}</p>
      <div className="a-in d4" style={{ position: 'absolute', left: 120, right: 120, bottom: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #D9DDDA', paddingTop: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{DECK.meta.presenters.join(' · ')}</div>
        <div style={{ fontSize: 20, color: '#59615C' }}>{DECK.meta.date}</div>
      </div>
    </div>
  );
}

function Hero({ q, qi, p }: { q: Question; qi: number; p: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 140px', textAlign: 'center' }}>
      <div className="a-in" style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 19, color: '#59615C' }}>
        <span style={{ background: '#1F6B45', color: '#FFFFFF', fontWeight: 700, padding: '4px 12px', borderRadius: 3 }}>{q.id}</span>
        <span>Pregunta {qi + 1} de {DECK.questions.length}</span>
      </div>
      <h1 className="a-up d1" style={{ fontSize: q.question.length > 170 ? 52 : 60, lineHeight: 1.18, fontWeight: 700, margin: '30px 0 0', maxWidth: 1280 }}>{plainQuestion(q.question)}</h1>
      {p >= 1 && (
        <div className="a-up" style={{ marginTop: 60, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 56, width: '100%', maxWidth: 1240, textAlign: 'left', borderTop: '1px solid #D9DDDA', paddingTop: 34 }}>
          <div><div className="eyebrow">A qué responde · {q.objective.code}</div><p style={{ fontSize: 25, lineHeight: 1.45, margin: '12px 0 0', color: '#2B322E' }}>{q.objective.text}</p></div>
          <div><div className="eyebrow">Por qué se formuló</div><p style={{ fontSize: 25, lineHeight: 1.45, margin: '12px 0 0', color: '#2B322E' }}>{q.rationale}</p></div>
        </div>
      )}
    </div>
  );
}

type RefFn = (k: string) => (el: HTMLSpanElement | null) => void;

function Keywords({ q, p, fly, flyOff, segRef, chipRef }: { q: Question; p: number; fly: Fly; flyOff: Record<string, [number, number, number]>; segRef: RefFn; chipRef: RefFn }) {
  const segs = parseQuestion(q.question); const kws = segs.filter((s) => s.kw);
  const n = q.blocks.length;
  const maxTerms = Math.max(...q.blocks.map((b) => b.terms.length));
  const termFont = maxTerms > 9 ? 14 : maxTerms > 6 ? 15 : 17;
  const chainLen = q.blocks.reduce((a, b) => a + orGroup(b.terms).length, 0);
  const chainFont = chainLen > 480 ? 14 : chainLen > 320 ? 16 : 18;

  const chipStyle = (key: string, ord: number): CSSProperties => {
    if (fly === 'measure') return { opacity: 0 };
    if (fly === 'from') { const f = flyOff[key]; return f ? { transform: `translate(${f[0]}px, ${f[1]}px) scale(${f[2]})`, transition: 'none' } : {}; }
    if (fly === 'go') return { transform: 'translate(0px, 0px) scale(1)', transition: `transform 900ms cubic-bezier(.2,.75,.2,1) ${ord * 140}ms` };
    if (fly === 'none') return { animationDelay: `${ord * 140}ms` };
    return {};
  };

  return (
    <div style={{ position: 'absolute', inset: 0, padding: '28px 72px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <p className={'qtext' + (p >= 3 ? ' small' : '')} style={p >= 3 ? { fontSize: q.question.length > 170 ? 25 : 30 } : q.question.length > 170 ? { fontSize: 40 } : undefined}>
        {segs.map((s, idx) => {
          if (!s.kw) return <span key={idx} className="seg">{s.text}</span>;
          const ord = kws.indexOf(s);
          return (
            <span key={idx} ref={segRef(s.key!)} className={'seg kw' + (p >= 1 ? ' on' : '') + (p >= 2 ? ' gone' : '')} style={{ transitionDelay: `${p === 1 ? ord * 220 : 0}ms` }}>{s.text}</span>
          );
        })}
      </p>
      {p >= 2 && (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {q.blocks.map((b, bi) => (
            <div key={bi} style={{ display: 'contents' }}>
              <div className="bcard" style={{ animationDelay: `${bi * 90}ms` }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
                  {kws.filter((s) => s.block === bi).map((s) => (
                    <span key={s.key} ref={chipRef(s.key!)} className={'chip' + (fly === 'none' ? ' a-pop' : '')} style={{ ...chipStyle(s.key!, kws.indexOf(s)), fontSize: p >= 3 ? 21 : 26 }}>{s.text}</span>
                  ))}
                </div>
                {p >= 3 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', borderTop: '1px solid #E3E6E4', paddingTop: 12 }}>
                    {b.terms.map((t, ti) => {
                      const d = p === 3 ? 350 + bi * 180 + ti * 90 : 0;
                      return (
                        <span key={ti} style={{ display: 'contents' }}>
                          <span className="term" style={{ animationDelay: `${d}ms`, fontSize: termFont, padding: '4px 8px' }}>{t}</span>
                          {ti < b.terms.length - 1 && <span className="or" style={{ animationDelay: `${d + 70}ms`, fontSize: 12 }}>OR</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {bi < n - 1 && <div className={'andc' + (p >= 4 ? ' on' : '')}><span>AND</span></div>}
            </div>
          ))}
        </div>
      )}
      {p >= 4 && (
        <div className="a-up" style={{ border: '1px solid #1F6B45', background: '#F4F9F6', padding: '14px 22px' }}>
          <div className="mono" style={{ fontSize: chainFont, lineHeight: 1.6, color: '#1C211E' }}>
            {q.blocks.map((b, bi) => (
              <span key={bi}>
                {bi > 0 && <span className="cand" style={{ animationDelay: `${(bi * 2 - 1) * 280 + 200}ms` }}>AND</span>}
                <span className="cpart" style={{ animationDelay: `${bi * 2 * 280 + 200}ms` }}>{orGroup(b.terms)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Copy({ q, tab, setTab, copied, onCopy }: { q: Question; tab: number; setTab: (t: number) => void; copied: number | 'fail' | null; onCopy: (t: string, i: number) => void }) {
  const db = q.databases[tab];
  const isCopied = copied === tab;
  const main = q.databases.filter((d) => !d.id.endsWith('B'));
  const totalAll = q.databases.reduce((a, d) => a + d.expected, 0);
  const longQuery = db.query.length > 700;
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '32px 80px 32px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h2 style={{ fontSize: 40, margin: 0 }}>Búsqueda avanzada de documentos</h2>
        <div style={{ textAlign: 'right', fontSize: 18, color: '#59615C' }}>
          Total en {q.databases.length === main.length ? 'las 3 bases' : `las ${q.databases.length} cadenas`}
          <div style={{ fontSize: 34, fontWeight: 700, color: '#1C211E' }}>{totalAll} registros</div>
        </div>
      </div>
      <div role="tablist" aria-label="Base de datos" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #D9DDDA', marginTop: 16 }}>
        {q.databases.map((d, k) => (
          <button key={d.id} type="button" role="tab" aria-selected={k === tab} className={'dbtab' + (k === tab ? ' on' : '')} style={q.databases.length > 3 ? { fontSize: 19, padding: '12px 18px' } : undefined} onClick={() => setTab(k)}>{d.label}</button>
        ))}
      </div>
      <div key={'db-' + db.id} className="a-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: 44, marginTop: 22, flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 18, color: '#3F4742' }}>
            <span>Cadena exacta · <b>{db.label}</b></span><span>Campo: {db.field}</span>
          </div>
          <pre className="qbox" style={{ maxHeight: 380, fontSize: longQuery ? 15 : db.query.length > 400 ? 17 : 19 }}>{db.query}</pre>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <button type="button" className={'copybtn' + (isCopied ? ' done' : '')} onClick={() => onCopy(db.query, tab)}>
              {isCopied
                ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" /></svg>}
              <span>{isCopied ? 'Copiado' : 'Copiar cadena'}</span>
            </button>
            <span style={{ fontSize: 18, color: '#59615C' }}>
              {copied === 'fail' ? 'No se pudo copiar: selecciona el texto y usa Cmd + C' : isCopied ? `Pégala en ${db.label.replace(' · compl.', '')} → Búsqueda avanzada` : <>Luego aplica los filtros de la derecha · <kbd>C</kbd> copia</>}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 15, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1F6B45', fontWeight: 700 }}>Filtros a aplicar</div>
          <div style={{ marginTop: 6 }}>
            {db.filters.map((f) => (
              <div key={f.k} className="fitem">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: 'none', marginTop: 1 }}><rect x="2.5" y="2.5" width="19" height="19" rx="2" fill="#1F6B45" /><path d="M7 12.5l3.2 3.2L17 9" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <div><div style={{ color: '#59615C', fontSize: 16 }}>{f.k}</div><div style={{ fontWeight: 700 }}>{f.v}</div></div>
              </div>
            ))}
          </div>
          {db.note && <p className="dbnote" style={{ margin: '14px 0 0' }}>{db.note}</p>}
          <div style={{ marginTop: 'auto', border: '1px solid #D2D8D4', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div><div style={{ fontSize: 17, color: '#59615C' }}>Resultados esperados</div><div style={{ fontSize: 60, fontWeight: 700, color: '#1F6B45', lineHeight: 1 }}>{db.expected}</div></div>
            <div style={{ textAlign: 'right', fontSize: 17, color: '#59615C' }}>Ejecutada el<div style={{ fontSize: 22, color: '#1C211E', fontWeight: 700 }}>{fmtDate(db.date)}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Matrix({ q, p }: { q: Question; p: number }) {
  const { M, subs, total, w } = weights(q);
  const n = q.criteria.length;
  const cols = `400px repeat(${n}, 64px) 104px 104px`;
  const maxSub = Math.max(...subs) || 1;
  const order = q.criteria.map((_, k) => k).sort((a, b) => subs[b] - subs[a]);
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '30px 64px 30px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h2 style={{ fontSize: 40, margin: 0 }}>Matriz de enfrentamiento</h2>
        <div style={{ fontSize: 18, color: '#3F4742', maxWidth: 560, textAlign: 'right' }}><b>1</b> = el criterio de la fila pesa más que el de la columna. Peso = subtotal / {total} comparaciones.</div>
      </div>
      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
        <div role="table" aria-label="Matriz de enfrentamiento" style={{ flex: 'none' }}>
          <div role="row" style={{ display: 'grid', gridTemplateColumns: cols }}>
            <div className="mhead" style={{ justifyContent: 'flex-start' }}>Criterio</div>
            {q.criteria.map((_, k) => <div key={k} className="mhead">{LETTERS[k]}</div>)}
            <div className="mhead">Subtotal</div><div className="mhead">Peso</div>
          </div>
          {q.criteria.map((c, r) => (
            <div key={r} role="row" style={{ display: 'grid', gridTemplateColumns: cols }}>
              <div className="mrowh"><b style={{ color: '#1F6B45', width: 26, flex: 'none' }}>{LETTERS[r]}</b><span>{c}</span></div>
              {M[r].map((x, ci) => (
                <div key={ci} className={r === ci ? 'mcell diag' : 'mcell' + (p >= 1 ? ' in' : '') + (x === 1 ? ' one' : '')} style={{ animationDelay: `${(r * n + ci) * 40}ms` }}>
                  <span className="val">{r === ci ? '' : String(x)}</span>
                </div>
              ))}
              <div className={'msub' + (p >= 2 ? ' in' : '')} style={{ animationDelay: `${r * 110}ms` }}><span className="val">{subs[r]}</span></div>
              <div className={'msub' + (p >= 2 ? ' in' : '')} style={{ animationDelay: `${r * 110 + 60}ms` }}><span className="val" style={{ color: '#1F6B45' }}>{pct(w[r])}</span></div>
            </div>
          ))}
          <div role="row" style={{ display: 'grid', gridTemplateColumns: cols, borderTop: '2px solid #1C211E' }}>
            <div className="mrowh" style={{ fontWeight: 700, borderBottom: 0 }}>Total</div>
            {q.criteria.map((_, k) => <div key={k} />)}
            <div className={'msub' + (p >= 2 ? ' in' : '')} style={{ borderBottom: 0 }}><span className="val">{total}</span></div>
            <div className={'msub' + (p >= 2 ? ' in' : '')} style={{ borderBottom: 0 }}><span className="val">100 %</span></div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #D9DDDA', paddingLeft: 32, minHeight: 480 }}>
          <div style={{ fontSize: 15, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1F6B45', fontWeight: 700 }}>Pesos ordenados</div>
          {p >= 3 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
              {order.map((r, k) => (
                <div key={r} className="a-in" style={{ animationDelay: `${k * 110}ms` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginBottom: 4, gap: 8 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><b style={{ color: '#1F6B45' }}>{LETTERS[r]}</b> {q.criteria[r]}</span><b style={{ whiteSpace: 'nowrap' }}>{pct(w[r])}</b>
                  </div>
                  <div style={{ height: 22, background: '#EEF1EF' }}><div className="bar" style={{ height: 22, width: `${((subs[r] / maxSub) * 100).toFixed(1)}%`, animationDelay: `${k * 110 + 100}ms` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 19, color: '#59615C', fontStyle: 'italic', margin: '20px 0 0' }}>Los pesos aparecerán ordenados cuando se complete la matriz.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Bench({ q, p }: { q: Question; p: number }) {
  const { w } = weights(q);
  const scores = q.papers.map((pp) => scoreOf(pp.scores, w));
  const madres = new Set(q.mothers.map((m) => m.author));
  const ranked = q.papers.map((pp, k) => ({ pp, s: scores[k] })).sort((a, b) => b.s - a.s);
  const cols = `360px 84px repeat(${q.papers.length}, minmax(0, 1fr))`;
  const max = 5;

  if (p >= 3) {
    return (
      <div style={{ position: 'absolute', inset: 0, padding: '30px 120px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h2 style={{ fontSize: 40, margin: 0 }}>Benchmarking · ranking</h2>
          <div style={{ fontSize: 18, color: '#3F4742', textAlign: 'right' }}>Los 4 primeros son los <b style={{ color: '#1F6B45' }}>papers madre</b></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {ranked.map(({ pp, s }, k) => {
            const isM = madres.has(pp.name);
            return (
              <div key={pp.name} className={'rank a-in' + (isM ? ' madre' : ' dim')} style={{ animationDelay: `${k * 90}ms` }}>
                <span style={{ fontWeight: 700, color: isM ? '#1F6B45' : '#59615C' }}>{k + 1}.º</span>
                <span style={{ fontWeight: 700 }}>{pp.name} <span style={{ fontWeight: 400, color: '#59615C' }}>({pp.year})</span></span>
                <div style={{ height: 30, background: '#EEF1EF' }}><div className="rbar" style={{ width: `${(s / max) * 100}%`, animationDelay: `${k * 90 + 80}ms` }} /></div>
                <span style={{ fontWeight: 700, textAlign: 'right' }}>{num(s)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto', fontSize: 17, color: '#59615C' }}>Puntaje = Σ (calificación × peso), sobre 5. La calidad (0 a 12) dice qué tan bueno es el artículo; el benchmarking dice cuánto sirve a Petra v2.</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, padding: '30px 64px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h2 style={{ fontSize: 40, margin: 0 }}>Matriz de benchmarking</h2>
        <div style={{ fontSize: 17, color: '#3F4742', maxWidth: 640, textAlign: 'right' }}>Calificación 1–5: <b>5</b> tema central con datos reales · <b>1</b> no lo trata. Puntaje = Σ calificación × peso.</div>
      </div>
      <div role="table" aria-label="Matriz de benchmarking">
        <div role="row" style={{ display: 'grid', gridTemplateColumns: cols }}>
          <div className="bhd" style={{ justifyContent: 'flex-start' }}>Criterio</div>
          <div className="bhd">Peso</div>
          {q.papers.map((pp) => (
            <div key={pp.name} className={'bhd bcol' + (p >= 2 && madres.has(pp.name) ? ' madre' : '')}>{pp.name}</div>
          ))}
        </div>
        {q.criteria.map((c, r) => (
          <div key={r} role="row" style={{ display: 'grid', gridTemplateColumns: cols }}>
            <div className="bcrit"><b style={{ color: '#1F6B45', width: 22, flex: 'none' }}>{LETTERS[r]}</b><span>{c}</span></div>
            <div className="bw">{pct(w[r])}</div>
            {q.papers.map((pp, k) => {
              const v = pp.scores[r];
              return (
                <div key={k} className={'bcell bcol' + (p >= 1 ? ' in' : '') + (p >= 1 && v >= 5 ? ' s5' : p >= 1 && v === 4 ? ' s4' : '') + (p >= 2 && madres.has(pp.name) ? ' madre' : '')} style={{ animationDelay: `${(k * q.criteria.length + r) * 22}ms` }}>
                  <span className="val">{v}</span>
                </div>
              );
            })}
          </div>
        ))}
        <div role="row" style={{ display: 'grid', gridTemplateColumns: cols, borderTop: '2px solid #1C211E' }}>
          <div className="bcrit" style={{ fontWeight: 700, borderBottom: 0, minHeight: 56 }}>Puntaje ponderado</div>
          <div className="bw" style={{ borderBottom: 0, minHeight: 56, color: '#1C211E' }}>100 %</div>
          {q.papers.map((pp, k) => (
            <div key={k} className={'bscore' + (p >= 2 ? ' in' : '') + (p >= 2 && madres.has(pp.name) ? ' madre' : '')} style={{ animationDelay: `${k * 90}ms` }}>
              <span className="val">{num(scores[k])}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Madre({ q, mi }: { q: Question; mi: number }) {
  const m = q.mothers[mi];
  const long = m.author.length > 12;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 100px', textAlign: 'center' }}>
      <div className="eyebrow a-in">{q.id} · Paper madre {mi + 1} de {q.mothers.length}</div>
      <div className="a-up d1" style={{ fontSize: long ? 140 : 176, fontWeight: 700, lineHeight: 1.02, marginTop: 34, letterSpacing: '-0.02em', maxWidth: 1400 }}>{m.author}, {m.year}</div>
      <div className="rule" style={{ marginTop: 44 }} />
      <div className="a-up d3" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 40, border: '1px solid #D2D8D4', borderRadius: 999, padding: '8px 22px 8px 8px' }}>
        <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#1F6B45', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>{m.presenter.charAt(0)}</span>
        <span style={{ fontSize: 22, color: '#59615C' }}>Expone</span><span style={{ fontSize: 24, fontWeight: 700 }}>{m.presenter}</span>
      </div>
    </div>
  );
}

function End() {
  const qs = DECK.questions;
  const madres = qs.reduce((a, q) => a + q.mothers.length, 0);
  const papers = qs.reduce((a, q) => a + q.papers.length, 0);
  const stats = [[qs.length, 'preguntas'], [3, 'bases de datos'], [papers, 'artículos analizados'], [madres, 'papers madre']] as const;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 120px' }}>
      <div className="eyebrow a-in">Cierre</div>
      <h1 className="a-up d1" style={{ fontSize: 112, margin: '18px 0 0', lineHeight: 1 }}>Gracias</h1>
      <p className="a-up d2" style={{ fontSize: 34, color: '#38403B', margin: '22px 0 0' }}>¿Preguntas?</p>
      <div className="a-in d3" style={{ marginTop: 60, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 260px))', gap: 40, borderTop: '1px solid #D9DDDA', paddingTop: 30 }}>
        {stats.map(([v, l]) => (
          <div key={l}><div style={{ fontSize: 64, fontWeight: 700, color: '#1F6B45', lineHeight: 1 }}>{v}</div><div style={{ fontSize: 20, color: '#59615C', marginTop: 8 }}>{l}</div></div>
        ))}
      </div>
      <div className="a-in d4" style={{ marginTop: 48, fontSize: 26, fontWeight: 700 }}>{DECK.meta.presenters.join(' · ')}</div>
    </div>
  );
}
