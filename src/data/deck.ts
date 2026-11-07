// Datos reales del TDP. Fuentes:
// - Cadenas y bloques: TDP/Fuentes/busquedas/estado-del-arte/p*.toml (searches.json)
// - Conteos: Tablas 27–28 y trazabilidad del 07/11/2026 (IEEE reexportado con filtros)
// - Matrices de enfrentamiento y benchmarking: Tablas 35–48 de 3.3
// - Papers madre y expositor: Simulacro (Fabrizio 1.º y 3.º, Stefanie 2.º y 4.º)
import searches from './searches.json';

export type DbId = 'scopus' | 'wos' | 'ieee' | 'scopusB' | 'wosB' | 'ieeeB';

export interface DbConf {
  id: DbId;
  label: string;
  field: string;
  query: string;
  filters: { k: string; v: string }[];
  expected: number;
  date: string;
  note?: string;
}

export interface Paper { name: string; year: number; scores: number[] }

export interface Question {
  id: string;
  short: string;
  question: string; // [texto|bloque] marca las palabras clave
  objective: { code: string; text: string };
  rationale: string;
  blocks: { name: string; terms: string[] }[];
  databases: DbConf[];
  criteria: string[]; // ordenados de mayor a menor peso (A, B, C…)
  papers: Paper[]; // en el orden de la tabla de benchmarking
  mothers: { author: string; year: number; presenter: 'Fabrizio' | 'Stefanie'; src: { q: string; db: 'SCOPUS' | 'WOS' }; also: string[]; title: string }[];
}

type S = { blocks: { name: string; terms: string[] }[]; queries: Record<string, string> };
const SR = searches as Record<string, S>;

const SC_FILTERS = [
  { k: 'Año de publicación', v: '2025–2026 (en la cadena)' },
  { k: 'Tipo de documento', v: 'Article (en la cadena)' },
  { k: 'Tipo de fuente', v: 'Journal (en la cadena)' },
];
const wosFilters = (years = '2025–2026') => [
  { k: 'Campo', v: 'Topic (TS)' },
  { k: 'Publication Years', v: years },
  { k: 'Document Types', v: 'Article' },
];
const ieeeFilters = (journals = true) => [
  { k: 'Modo', v: 'Command Search' },
  { k: 'Year', v: '2025–2026' },
  { k: 'Content Type', v: journals ? 'Journals' : 'Sin filtro (exportado así)' },
];

function dbs(id: string, date: string, n: [number, number, number], opts: { wosYears?: string; ieeeJournals?: boolean; ieeeDate?: string; notes?: Partial<Record<DbId, string>> } = {}): DbConf[] {
  const q = SR[id].queries;
  return [
    { id: 'scopus', label: 'Scopus', field: 'TITLE-ABS-KEY', query: q.SCOPUS, filters: SC_FILTERS, expected: n[0], date, note: opts.notes?.scopus },
    { id: 'wos', label: 'Web of Science', field: 'Topic (TS)', query: q.WOS, filters: wosFilters(opts.wosYears), expected: n[1], date, note: opts.notes?.wos },
    { id: 'ieee', label: 'IEEE Xplore', field: 'All Metadata', query: q.IEEE, filters: ieeeFilters(opts.ieeeJournals ?? true), expected: n[2], date: opts.ieeeDate ?? date, note: opts.notes?.ieee },
  ];
}

/** Cadena exacta de la que sale un paper madre (verificada en los CSV OFICIAL de Trazabilidad/CSV-por-pregunta). */
export function motherSource(m: Question['mothers'][number]) {
  return { label: `${m.src.q} · ${m.src.db === 'WOS' ? 'Web of Science' : 'Scopus'}`, query: SR[m.src.q].queries[m.src.db] };
}

export const DECK = {
  meta: {
    subtitle: 'Petra v2: motor configurable de flujos de trabajo con creación de solicitudes asistida por IA para Flip Inversiones',
    presenters: ['Fabrizio Contreras', 'Stefanie Finizzio'],
    date: 'Noviembre 2026',
  },
  questions: [
    {
      id: 'P1', short: 'Adopción',
      question: '¿Qué factores influyen en la [adopción|2] de [sistemas de flujos de trabajo|0] en [organizaciones pequeñas|1]?',
      objective: { code: 'OE1 y OE4', text: 'Las condiciones que el diseño debe respetar para que el efecto del motor llegue a medirse: la validación del OE4 depende de que la gente lo use.' },
      rationale: 'Las entrevistas apuntaron a la cultura horizontal de Flip como la causa del abandono de cada propuesta anterior, incluida Petra v1.',
      blocks: SR.P1.blocks,
      databases: dbs('P1', '2026-10-03', [19, 6, 4]),
      criteria: ['Resistencia e intención de uso', 'Complejidad y ajuste a la práctica', 'Beneficio percibido', 'Gestión del cambio y adopción gradual', 'Capacitación y competencias', 'Apoyo de la gerencia e incentivos', 'Presión regulatoria', 'Costo y recursos'],
      papers: [
        { name: 'Arno', year: 2025, scores: [1, 4, 1, 1, 4, 2, 1, 4] },
        { name: 'Al-Hiyari', year: 2025, scores: [1, 5, 5, 1, 5, 5, 5, 1] },
        { name: 'Bernat', year: 2026, scores: [4, 1, 5, 4, 4, 4, 1, 4] },
        { name: 'Olortegui-Alcalde', year: 2025, scores: [4, 1, 5, 1, 4, 1, 1, 4] },
        { name: 'Amanollahnejad', year: 2026, scores: [1, 4, 1, 5, 4, 1, 5, 2] },
        { name: 'Li', year: 2025, scores: [4, 1, 4, 1, 1, 4, 1, 1] },
        { name: 'Kobets', year: 2025, scores: [4, 1, 5, 1, 4, 1, 1, 4] },
        { name: 'Singh', year: 2026, scores: [1, 3, 1, 1, 1, 1, 3, 3] },
      ],
      mothers: [
        { author: 'Al-Hiyari', year: 2025, presenter: 'Fabrizio', src: { q: 'P1', db: 'SCOPUS' }, also: [], title: 'Antecedents and consequences of automated VAT solution adoption in Gulf cooperation countries: the case of the United Arab Emirates' },
        { author: 'Bernat', year: 2026, presenter: 'Stefanie', src: { q: 'P1', db: 'WOS' }, also: ['P1 · Scopus'], title: 'Digital Transformation and Innovation in an Entrepreneurial Fintech SME: Implications for Social Sustainability from the PiggyVest Case' },
        { author: 'Olortegui-Alcalde', year: 2025, presenter: 'Fabrizio', src: { q: 'P1', db: 'SCOPUS' }, also: [], title: 'Digital innovation and performance of student startups in Peru: A PLS-SEM evaluation' },
        { author: 'Kobets', year: 2025, presenter: 'Stefanie', src: { q: 'P1', db: 'SCOPUS' }, also: [], title: 'Using big data to increase the efficiency of business processes in the digital economy of Ukraine' },
      ],
    },
    {
      id: 'P2', short: 'Coordinación',
      question: '¿Qué [mecanismos de coordinación|1] ([asignación, delegación, escalamiento, plazos|1]) incorporan los [motores de flujos|0] [configurables|1]?',
      objective: { code: 'OE2 y OE3', text: 'Qué mecanismos de coordinación ya resolvió la literatura y cuáles tiene que diseñar y construir Petra v2.' },
      rationale: 'Las tareas se estancan porque nadie vigila plazos, no hay responsables alternos y nada escala cuando alguien no responde.',
      blocks: SR.P2.blocks,
      databases: dbs('P2', '2026-10-03', [18, 6, 0], { ieeeDate: '2026-11-07', notes: { ieee: 'Reexportada el 07/11/2026 con filtros. La anterior (3) no aplicó el año y traía un BPMs de robótica.' } }),
      criteria: ['Plazos', 'Escalamiento', 'Delegación y alternos', 'Configurabilidad', 'Asignación', 'Validación humana', 'Trazabilidad', 'Roles y segregación'],
      papers: [
        { name: 'Xu', year: 2026, scores: [2, 1, 1, 5, 1, 4, 1, 4] },
        { name: 'Zaki', year: 2026, scores: [5, 1, 1, 1, 1, 1, 2, 1] },
        { name: 'Lo Bianco', year: 2026, scores: [2, 1, 1, 1, 4, 1, 1, 1] },
        { name: 'Leburu', year: 2026, scores: [1, 1, 1, 1, 1, 2, 4, 4] },
        { name: 'Ilieva', year: 2026, scores: [1, 3, 1, 2, 1, 3, 3, 2] },
        { name: 'Mpinga', year: 2026, scores: [1, 1, 1, 1, 1, 3, 2, 3] },
        { name: 'Seo', year: 2026, scores: [1, 1, 1, 1, 2, 5, 1, 2] },
        { name: 'Zhu', year: 2025, scores: [4, 1, 1, 1, 4, 1, 1, 1] },
      ],
      mothers: [
        { author: 'Zhu', year: 2025, presenter: 'Fabrizio', src: { q: 'P2', db: 'WOS' }, also: ['P2 · Scopus'], title: 'Deadline-constrained and bi-objective workflow scheduling with fuzziness in cloud computing systems' },
        { author: 'Xu', year: 2026, presenter: 'Stefanie', src: { q: 'P2', db: 'WOS' }, also: ['P2 · Scopus'], title: 'Managing astronomical observing proposals with AstroPropose: A customizable framework applied to the Einstein Probe mission' },
        { author: 'Zaki', year: 2026, presenter: 'Fabrizio', src: { q: 'P4', db: 'WOS' }, also: ['P4 · Scopus'], title: 'Validating temporal compliance patterns: A unified approach with MTLf over various data models' },
        { author: 'Ilieva', year: 2026, presenter: 'Stefanie', src: { q: 'P2', db: 'WOS' }, also: ['P2 · Scopus'], title: 'A Generative AI-Based Framework for Business Process Orchestration in Industrial Enterprises' },
      ],
    },
    {
      id: 'P3', short: 'IA de entrada',
      question: '¿Qué técnicas basadas en [modelos de lenguaje|0] se aplican para [clasificar solicitudes y extraer sus datos|2] a partir de texto libre en [procesos de negocio|1], y con qué resultados?',
      objective: { code: 'OE1 y OE4', text: 'Compara las técnicas de IA aplicables y prepara la evaluación separada de la creación asistida que exige el OE4.' },
      rationale: 'Petra v1 perdió el uso en la entrada: las solicitudes llegan como texto libre y alguien tiene que convertirlas a mano en un proceso.',
      blocks: SR.P3.blocks,
      databases: dbs('P3', '2026-10-24', [115, 85, 22], {
        wosYears: '2024–2026 (así se ejecutó)', ieeeDate: '2026-11-07',
        notes: { wos: 'Entraron 4 registros de 2024 y 2 de 2027; se excluyeron por IC1.', ieee: 'Reexportada el 07/11/2026 con Journals (antes 22). Omite «request triage» y «ticket triage».' },
      }),
      criteria: ['Clasificación del tipo de solicitud', 'Extracción de campos', 'Validación humana', 'Privacidad y modelo local', 'Uso sin entrenamiento', 'Recuperación de casos similares', 'Enrutamiento', 'Interfaz conversacional'],
      papers: [
        { name: 'Carroll', year: 2026, scores: [5, 1, 3, 2, 5, 5, 2, 1] },
        { name: 'Knezevic', year: 2026, scores: [5, 1, 3, 1, 5, 5, 5, 1] },
        { name: 'de Carvalho', year: 2026, scores: [2, 4, 5, 2, 2, 2, 2, 2] },
        { name: 'Roumeliotis', year: 2025, scores: [5, 1, 1, 1, 5, 1, 1, 1] },
        { name: 'Iwaszenko', year: 2026, scores: [5, 4, 3, 5, 5, 1, 4, 1] },
        { name: 'Gao', year: 2026, scores: [5, 5, 3, 1, 1, 4, 2, 1] },
        { name: 'Arconzo', year: 2026, scores: [1, 4, 3, 3, 4, 1, 2, 5] },
        { name: 'Towhid', year: 2026, scores: [5, 1, 1, 3, 4, 5, 2, 1] },
      ],
      mothers: [
        { author: 'Iwaszenko', year: 2026, presenter: 'Fabrizio', src: { q: 'P3', db: 'WOS' }, also: ['P3 · Scopus'], title: 'NLP System for Automation of Document Workflow in a Research and Development Organization—A Case Study' },
        { author: 'Gao', year: 2026, presenter: 'Stefanie', src: { q: 'P3', db: 'SCOPUS' }, also: [], title: 'An AI-driven integrated framework for procurement planning and tender document generation based on natural language processing' },
        { author: 'Carroll', year: 2026, presenter: 'Fabrizio', src: { q: 'P3', db: 'SCOPUS' }, also: [], title: 'Evaluating large language models for automated REDCap support ticket triage and response' },
        { author: 'Knezevic', year: 2026, presenter: 'Stefanie', src: { q: 'P3', db: 'WOS' }, also: ['P3 · Scopus'], title: 'Retrieval-Augmented Large Language Model-Based Framework for Hierarchical Classification of Public Feedback on Transportation Infrastructure' },
      ],
    },
    {
      id: 'P4', short: 'Medición',
      question: '¿Qué métodos basados en [registros de eventos|0] se usan para medir el [tiempo de ciclo, las demoras y los cuellos de botella|1] en [procesos de negocio|2], y con qué resultados?',
      objective: { code: 'OE4', text: 'Con qué métodos y con qué fiabilidad se miden el tiempo de ciclo y las tareas estancadas antes y después del motor.' },
      rationale: 'Sin medir desde el registro de eventos no se puede demostrar que Petra v2 reduce el tiempo de ciclo frente a la línea base.',
      blocks: SR.P4.blocks,
      databases: dbs('P4', '2026-10-03', [76, 34, 6], { ieeeDate: '2026-11-07', notes: { ieee: 'Reexportada el 07/11/2026 con filtros (antes 14); ya no trae a Malashin.' } }),
      criteria: ['Tiempo de ciclo y latencia', 'Plazos vencidos y umbrales', 'Estancamiento e inactividad', 'Comparación antes y después', 'Carga por responsable', 'Causas de la demora', 'Presentación a quien no es analista', 'Enfoque centrado en objetos'],
      papers: [
        { name: 'Park', year: 2025, scores: [4, 5, 2, 1, 1, 1, 2, 5] },
        { name: 'Butoracová', year: 2026, scores: [4, 1, 3, 4, 4, 3, 2, 1] },
        { name: 'Hendrata', year: 2026, scores: [4, 1, 1, 1, 1, 4, 5, 1] },
        { name: 'Rubensson', year: 2025, scores: [4, 1, 1, 1, 1, 1, 4, 1] },
        { name: 'Fang', year: 2026, scores: [4, 3, 2, 1, 1, 1, 1, 1] },
        { name: 'López-Pintado', year: 2025, scores: [4, 1, 1, 2, 5, 3, 1, 1] },
        { name: 'Hoogmoed', year: 2026, scores: [3, 1, 1, 1, 4, 3, 4, 1] },
        { name: 'Guo', year: 2026, scores: [4, 5, 1, 3, 4, 5, 2, 1] },
      ],
      mothers: [
        { author: 'Guo', year: 2026, presenter: 'Fabrizio', src: { q: 'P4', db: 'SCOPUS' }, also: ['P4 · Web of Science'], title: 'Detecting Root Causes for Process Performance Anomalies Using Causal Inference' },
        { author: 'Butoracová', year: 2026, presenter: 'Stefanie', src: { q: 'P4', db: 'SCOPUS' }, also: [], title: 'Optimizing State Aid Processes During COVID-19 in the Slovak Republic: Model, Simulation, and Savings' },
        { author: 'Park', year: 2025, presenter: 'Stefanie', src: { q: 'P4', db: 'SCOPUS' }, also: [], title: 'Operational process monitoring: An object-centric approach' },
        { author: 'López-Pintado', year: 2025, presenter: 'Fabrizio', src: { q: 'P4', db: 'SCOPUS' }, also: [], title: 'Business process simulation: Probabilistic modeling of intermittent resource availability and multitasking behavior' },
      ],
    },
    {
      id: 'P5', short: 'Voz',
      question: '¿Qué técnicas basadas en [reconocimiento de voz|0] y modelos de lenguaje se usan para identificar [tareas, compromisos y responsables|2] a partir de [mensajes de voz|0] y [conversaciones habladas en el trabajo|1], y con qué resultados?',
      objective: { code: 'OE4', text: 'Responde a la entrada hablada de RF03 y RF12 y, como P3, prepara la evaluación de la creación asistida.' },
      rationale: 'Muchos encargos llegan como notas de voz por WhatsApp o se acuerdan en reuniones presenciales y nunca se registran.',
      blocks: SR.P5.blocks,
      databases: [
        ...dbs('P5', '2026-11-04', [11, 8, 29], { ieeeJournals: false, notes: { ieee: 'Sin filtro Journals: 29 ponencias, excluidas por EC1. Repetida el 07/11: 27 ponencias y 0 artículos de revista.' } }),
        { id: 'scopusB', label: 'Scopus · compl.', field: 'TITLE-ABS-KEY', query: SR.P5.queries.SCOPUSB, filters: SC_FILTERS, expected: 432, date: '2026-11-04', note: 'Cadena complementaria sin el bloque de voz.' },
        { id: 'wosB', label: 'WoS · compl.', field: 'Topic (TS)', query: SR.P5.queries.WOSB, filters: wosFilters(), expected: 8, date: '2026-11-04', note: 'Complementaria: devolvió los mismos 8 registros de la principal.' },
        { id: 'ieeeB', label: 'IEEE · compl.', field: 'All Metadata', query: SR.P5.queries.IEEEB, filters: ieeeFilters(true), expected: 13, date: '2026-11-07', note: 'Reexportada con filtro de año (antes 21; los 8 de diferencia eran de 2024).' },
      ],
      criteria: ['Tareas, acuerdos y decisiones', 'Responsable y plazo', 'Validación humana antes de registrar', 'Reconocimiento de voz y de hablantes en audio real', 'Privacidad, consentimiento y modelo local', 'Uso sin entrenamiento', 'Resumen o acta general'],
      papers: [
        { name: 'Chen', year: 2025, scores: [4, 2, 1, 5, 4, 4, 5] },
        { name: 'Sood', year: 2026, scores: [4, 2, 2, 1, 3, 5, 4] },
        { name: 'Asthana', year: 2025, scores: [5, 4, 4, 2, 2, 1, 5] },
        { name: 'Wang', year: 2026, scores: [2, 1, 5, 2, 2, 4, 5] },
        { name: 'Jin', year: 2025, scores: [5, 1, 1, 2, 1, 2, 4] },
        { name: 'Alshwiah', year: 2026, scores: [4, 2, 4, 3, 2, 3, 4] },
        { name: 'Liu', year: 2025, scores: [2, 1, 2, 2, 2, 3, 4] },
      ],
      mothers: [
        { author: 'Asthana', year: 2025, presenter: 'Fabrizio', src: { q: 'P5', db: 'SCOPUS' }, also: ['P5 · Scopus complementaria'], title: 'Summaries, Highlights, and Action Items: Design, Implementation and Evaluation of an LLM-powered Meeting Recap System' },
        { author: 'Alshwiah', year: 2026, presenter: 'Stefanie', src: { q: 'P5', db: 'SCOPUS' }, also: ['P5 · Scopus complementaria'], title: 'The role of artificial intelligence (AI) in assisting students with writing Zoom meeting minutes: a qualitative study' },
        { author: 'Chen', year: 2025, presenter: 'Fabrizio', src: { q: 'P5', db: 'WOS' }, also: ['P5 · WoS complementaria'], title: 'Meet2Mitigate: An LLM-powered framework for real-time issue identification and mitigation from construction meeting discourse' },
        { author: 'Sood', year: 2026, presenter: 'Stefanie', src: { q: 'P5', db: 'WOS' }, also: ['P5 · Scopus', 'P5 · Scopus complementaria', 'P5 · WoS complementaria'], title: 'MeetMulti-X: A benchmark analysis of scaling and prompting large language models on automatic minuting' },
      ],
    },
  ] as Question[],
};
