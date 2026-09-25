"use strict";
import {
  getSession, onAuthChange, signIn, signUpWithInvite, signOut,
  resetPassword, updatePassword, myProfile, updateMyProfile, listProfiles, amIMember,
  SIGNUP_FAILED_MESSAGE,
} from './auth.js';
import * as invitesApi from './api/invites.js';
import * as store from './store.js';
import * as companiesApi from './api/companies.js';
import * as newsApi from './api/news.js';
import * as contactsApi from './api/contacts.js';
import * as competitorsApi from './api/competitors.js';
import * as researchApi from './api/research.js';
import * as tasksApi from './api/tasks.js';
import * as productsApi from './api/products.js';
import * as activityApi from './api/activity.js';
import * as connectorsApi from './api/connectors.js';
import * as rssSourcesApi from './api/rssSources.js';
import * as eventsApi from './api/events.js';
import * as profilesApi from './api/profiles.js';
import * as categoriesApi from './api/categories.js';
import * as servicesApi from './api/services.js';
import * as storeSharesApi from './api/storeShares.js';
import * as quoteTemplatesApi from './api/quoteTemplates.js';
import * as quotesApi from './api/quotes.js';
import * as rfqsApi from './api/rfqs.js';
import * as insightsApi from './api/insights.js';
import { detectTokens, buildQuoteFieldValues, renderTemplate, buildQuoteMarkdown, computeLineTotals, QUOTE_FIELDS } from './quoteFields.js';
import { uploadFile, signedUrl, removeFile, downloadText } from './storage.js';
import { csvToObjects } from './csv.js';
import { emailRule, normalizeLinkedin, normalizeUrlish, urlRule, dateRule, validateChanged } from './validate.js';

/* ============================================================
   ICONS (tiny inline SVGs)
   ============================================================ */
const ICONS = {
  dash:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.3" stroke="currentColor" stroke-width="1.4"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.3" stroke="currentColor" stroke-width="1.4"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.3" stroke="currentColor" stroke-width="1.4"/><rect x="11" y="11" width="6.5" height="6.5" rx="1.3" stroke="currentColor" stroke-width="1.4"/></svg>',
  building:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="4" y="3" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M7 6.5h1.4M11.6 6.5H13M7 9.7h1.4M11.6 9.7H13M7 13h1.4M11.6 13H13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  users:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><circle cx="7.2" cy="7" r="2.6" stroke="currentColor" stroke-width="1.4"/><path d="M2.6 16c.5-2.8 2.3-4.3 4.6-4.3s4.1 1.5 4.6 4.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="14.3" cy="6.3" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M12.8 11.3c1.8-.3 3.7.6 4.5 3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  task:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="3" y="3" width="14" height="14" rx="2.4" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 10.2l2.1 2.1 4.6-4.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bolt:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M11 2.5L4.5 11.5h4.2L8 17.5l6.7-9.7H10.6L11 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  search:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><circle cx="8.7" cy="8.7" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M15.5 15.5L12.4 12.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  plus:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  x:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  warn:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M10 2.5l8.2 14.5H1.8L10 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 8v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14" r="0.9" fill="currentColor"/></svg>',
  star:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M10 2.5l2.2 5 5.3.5-4 3.7 1.1 5.3L10 14.3 5.4 17l1.1-5.3-4-3.7 5.3-.5L10 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  download:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M10 3v9.5M6.2 9.2L10 13l3.8-3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15.5h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  upload:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M10 13V3.5M6.2 6.8L10 3l3.8 3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15.5h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  linkedin:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="2.5" y="2.5" width="15" height="15" rx="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M6.6 8.4v5.2M6.6 6.3v.02" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9.6 13.6V10.5c0-1.2.8-2 1.9-2s1.7.7 1.7 2v3.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  mail:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M3.2 5.5L10 11l6.8-5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  phone:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M4.2 3.3h2.6l1.1 3.3-1.6 1.4c.7 1.7 2 3 3.7 3.7l1.4-1.6 3.3 1.1v2.6c0 1-.8 1.8-1.8 1.7C7.3 15.1 4.9 12.7 4.5 6.9c-.1-1 .7-1.8 1.7-1.8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  empty:'<svg viewBox="0 0 40 40" width="36" fill="none"><circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="1.6"/><path d="M14 20h12M20 14v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  chevron:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  radar:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="10" r="3.8" stroke="currentColor" stroke-width="1.2"/><path d="M10 10L15.5 5.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="10" r="0.9" fill="currentColor"/></svg>',
  clip:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M7 5.5V4.2a2 2 0 0 1 4 0v6.6a3.5 3.5 0 1 1-7 0V6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="6.5" y="4.5" width="4" height="7" rx="1.2" stroke="currentColor" stroke-width="1.2"/></svg>',
  doc:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M5.5 2.5h6l3 3v12h-9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11.5 2.5v3h3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7.3 10h5.4M7.3 12.4h5.4M7.3 14.8h3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  docPlus:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M5.5 2.5h6l3 3v12h-9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11.5 2.5v3h3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 11.5h4M10 9.5v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  outbox:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M3 11.5V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4.5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 2.5v9M6.3 8.2L10 11.5l3.7-3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 11.5h4l1.3 2h3.4l1.3-2h4" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  barChart:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M3 17V3M3 17h14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><rect x="5.5" y="10.5" width="2.6" height="6.5" stroke="currentColor" stroke-width="1.2"/><rect x="9.7" y="6.5" width="2.6" height="10.5" stroke="currentColor" stroke-width="1.2"/><rect x="13.9" y="3.5" width="2.6" height="13.5" stroke="currentColor" stroke-width="1.2"/></svg>',
  scroll:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="2" y="6" width="16" height="8" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M6 10h.01M9.5 10h.01M13 10h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  building2:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="2.5" y="7" width="6" height="10" stroke="currentColor" stroke-width="1.3"/><rect x="11.5" y="3" width="6" height="14" stroke="currentColor" stroke-width="1.3"/><path d="M14 6.3h1M14 9h1M14 11.7h1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
  calendar:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="2.5" y="4" width="15" height="13.5" rx="1.8" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 8h15M6.3 2.3v3M13.7 2.3v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 11h2M9.5 11h2M13 11h1M6 14h2M9.5 14h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  shield:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M10 2.5l6.5 2.4v4.6c0 4.3-2.7 7.3-6.5 8.2C6.2 16.8 3.5 13.8 3.5 9.5V4.9L10 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7.2 9.8l1.9 1.9 3.7-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  send:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M17.3 2.7L2.5 8.3l5.7 2.3M17.3 2.7L11.9 17.5l-3.7-6.9M17.3 2.7L8.2 10.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><rect x="4" y="9" width="12" height="8.5" rx="1.6" stroke="currentColor" stroke-width="1.3"/><path d="M6.3 9V6.3a3.7 3.7 0 0 1 7.4 0V9" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="13" r="1.1" fill="currentColor"/></svg>',
  eye:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M1.5 10S4.7 4 10 4s8.5 6 8.5 6-3.2 6-8.5 6-8.5-6-8.5-6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.6" stroke="currentColor" stroke-width="1.3"/></svg>',
  eyeOff:'<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><path d="M2.8 2.8l14.4 14.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8.3 4.3C8.9 4.1 9.4 4 10 4c5.3 0 8.5 6 8.5 6s-.9 1.7-2.5 3.2M5.2 5.9C3 7.4 1.5 10 1.5 10s3.2 6 8.5 6c1 0 1.9-.2 2.7-.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.1 8.1a2.6 2.6 0 0 0 3.6 3.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  sun:'<svg viewBox="0 0 20 20" width="15" height="15" fill="none"><circle cx="10" cy="10" r="3.6" stroke="currentColor" stroke-width="1.4"/><path d="M10 1.8v2.1M10 16.1v2.1M18.2 10h-2.1M3.9 10H1.8M15.6 4.4l-1.5 1.5M5.9 14.1l-1.5 1.5M15.6 15.6l-1.5-1.5M5.9 5.9L4.4 4.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  moon:'<svg viewBox="0 0 20 20" width="15" height="15" fill="none"><path d="M17 11.8A7.5 7.5 0 1 1 8.2 3a6 6 0 0 0 8.8 8.8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  bell:'<svg viewBox="0 0 20 20" width="15" height="15" fill="none"><path d="M10 2.5a4 4 0 0 0-4 4v2.3c0 .8-.3 1.6-.9 2.2l-.9.9c-.6.6-.2 1.6.6 1.6h10.4c.8 0 1.2-1 .6-1.6l-.9-.9a3.1 3.1 0 0 1-.9-2.2V6.5a4 4 0 0 0-4-4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8.2 16.3a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
};

/* ============================================================
   SOLUTIONS CATALOG (Aerosub's own offerings)
   ============================================================ */
const SOLUTIONS = [
  {id:'drone', name:'Aerial Drone Inspection', tag:'Aerial', kind:'Product', status:'Active',
    blurb:'Visual, thermal and ultrasonic-thickness drone inspection of flare stacks, tanks, structures and pipelines, including OGI/methane monitoring.',
    highlights:['Visual, thermal and contact-UT sensor payloads on one flight programme','OGI/methane detection for flare and fugitive-emissions compliance','BVLOS-capable for long pipeline right-of-way runs','Removes personnel from height and confined-space exposure']},
  {id:'rov', name:'ROV Subsea Inspection', tag:'Subsea', kind:'Product', status:'Active',
    blurb:'Work-class and observation-class ROV inspection of platform legs/jackets, subsea pipelines, FPSO hulls and mooring/SPM systems.',
    highlights:['Work-class and observation-class vehicles for shallow to mid water depths','CVI, CP survey and NDT-ready tooling on the same vehicle','FPSO hull, riser, mooring and SPM/PLEM coverage','No diver mobilisation required']},
  {id:'crawler', name:'Crawler Confined-Space Inspection', tag:'Confined-Space', kind:'Product', status:'Active',
    blurb:'Magnetic and tracked crawler robots for zero-man-entry inspection of tanks, pressure vessels and ductwork.',
    highlights:['Zero-man tank entry — no confined-space permit required for the crew','API 653-aligned tank-floor and shell UT scanning','Fits vessel and ductwork geometries down to ~200mm','Full-coverage defect mapping, not spot checks']},
  {id:'cleaning', name:'Robotic Tank & Hull Cleaning', tag:'Cleaning', kind:'Offer', status:'Active',
    blurb:'Marine-growth removal and in-service tank cleaning using articulated brush and jet-based ROV/crawler tooling.',
    highlights:['Articulated brush heads conform to angled jacket members','In-service tank cleaning — no shutdown required','Reduces structural loading and corrosion risk from biofouling','Bundles with inspection for a single mobilisation']},
  {id:'platform', name:'Digital Asset-Integrity Platform', tag:'Data', kind:'Offer', status:'Pilot',
    blurb:'A single data layer fusing drone, ROV and crawler findings into defect trending and inspection-cycle planning.',
    highlights:['One record across drone, ROV and crawler datasets','Defect trending across inspection cycles, not just single reports','Built to plug into existing RBI programmes','Exportable reporting for regulator and JV-partner sign-off']},
  {id:'surveillance', name:'Pipeline ROW Drone Surveillance', tag:'Security', kind:'Offer', status:'Planned',
    blurb:'Long-range BVLOS drone patrol for pipeline right-of-way security, encroachment and vandalism detection.',
    highlights:['Long-range BVLOS patrol of pipeline right-of-way','Encroachment, illegal-tap and vandalism detection','Complements structural inspection lines already offered','Positions against incumbent security-only drone vendors']},
];

/* ============================================================
   PIPELINE STAGES
   ============================================================ */
const STAGES = [
  {id:'research',    label:'Researching',   dot:'#8b989b'},
  {id:'contact',      label:'Contact ID’d', dot:'#0c7c88'},
  {id:'outreach',     label:'Outreach Sent', dot:'#3aa0aa'},
  {id:'discussion',   label:'In Discussion', dot:'#9c6a05'},
  {id:'proposal',     label:'Proposal Sent', dot:'#c98a1f'},
  {id:'negotiation',  label:'Negotiating',   dot:'#8a6a00'},
  {id:'won',          label:'Won',           dot:'#1c7a52'},
  {id:'hold',         label:'On Hold',       dot:'#ab2b22'},
];
const stageOf = id => STAGES.find(s=>s.id===id) || STAGES[0];

const PRIORITIES = ['high','medium','low'];

// Suggested list for the company "sector" field (V2 Phase 0, item 2) — a
// plain text field, not a controlled taxonomy like product/service
// categories, so free text is still allowed via the <datalist>.
const SECTOR_OPTIONS = [
  'Oil & Gas — Upstream', 'Oil & Gas — Midstream', 'Oil & Gas — Downstream',
  'Marine & Offshore', 'Power & Utilities', 'EPC / Engineering Contractor',
  'Government / Regulatory', 'Other',
];
function sectorDatalist(id){
  return `<datalist id="${id}">${SECTOR_OPTIONS.map(s=>`<option value="${esc(s)}">`).join('')}</datalist>`;
}

/* ============================================================
   AEROSUB BRAND (pulled from aerosub.co, for the Report generator)
   ============================================================ */
const BRAND = {
  navy:'#0C1F61',
  blue:'#00A3DE',
  warm:'#FFBC7D',
  ink:'#1B1B1B',
  paper:'#FFFFFF',
  mist:'#F4F7FC',
  tagline:'Better Data . Better Insights . Better Decisions',
  positioning:'Most inspection vendors deliver reports. Aerosub delivers inspection intelligence.',
  logoDataUri:'data:image/png;base64,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',
  site:'aerosub.co',
};

// D-12: the LIVE_NEWS_SNAPSHOT marker block, mergeLiveNewsSnapshot(), and the
// dismissedNewsIds array (formerly here) are gone — Postgres is the source of
// news now (src/store.js, src/api/news.js), and dismissal is team-wide via
// news_items.dismissed_at (D-5). A V2 news-feed job would write news_items
// directly (PRD §12), not this block.


/* ============================================================
   SEED DATA
   ============================================================ */
function seedData(){
  const companies = [
    {
      id:'amni', name:'Amni International Petroleum', type:'Indigenous — Private E&P',
      priority:'medium', stage:'research', flags:[],
      summary:'Privately held Nigerian E&P operating Ima, Okoro and Setu (OML 112/117) plus Tubu (OML 52), and the Central Tano exploration block in Ghana. Shallow water (7–14m) across the Nigerian portfolio. A $2.5bn five-year development plan is underway, with the Okoro drilling campaign mobilised March 2026.',
      painPoints:[
        'FPSO Armada Perkasa (on station since 2008) has no public dry-dock or inspection record since a 2014 update',
        'Okoro platform is an unconventional CoSMOS structure — conductor-supported, no steel jacket',
        'Tubu (OML 52) is an unmanned, remotely operated wellhead platform 11km from its host — hard to reach manually',
        'No evidence anywhere of a drone, ROV or robotic inspection programme in place'
      ],
      currentSolutions:[
        'FPSO O&M handled by Bumi Armada (Malaysia) under bareboat charter',
        'ABS classification society surveys',
        'No named inspection-robotics vendor identified'
      ],
      recommended:[
        {sol:'rov', why:'Shallow 7–14m water depth across Ima, Okoro and Tubu suits compact ROV deployment on FPSO legs, risers and the unmanned Tubu wellhead platform.'},
        {sol:'crawler', why:'The jacket-less CoSMOS platform and remote Tubu WHP suit confined-space crawler inspection without a manned mobilisation.'}
      ],
      notes:'No named Asset Integrity contact — enter via the Offshore Installation Manager or Asset Management & External Relations.',
      contacts:[
        {name:'Chief (Dr.) Tunde J. Afolabi, MFR', pos:'Chairman & CEO', email:'', phone:'+234-1-9049870-9 (HQ)', linkedin:'', verified:false},
        {name:'Olajide Farinre', pos:'Executive Director, Group COO', email:'', phone:'', linkedin:'', verified:false},
        {name:'Leke Ogunlewe', pos:'Executive Director, Group CFO', email:'', phone:'', linkedin:'', verified:false},
        {name:'Frances Peters', pos:'GM, Contracts & Procurement', email:'', phone:'', linkedin:'', verified:false},
        {name:'Temi Salako', pos:'AGM, Asset Management & External Relations', email:'', phone:'', linkedin:'', verified:false},
        {name:'Ezekiel Ikeh, REng', pos:'Offshore Installation Manager', email:'', phone:'', linkedin:'', verified:false},
        {name:'Edward Eric', pos:'Operations Manager', email:'', phone:'', linkedin:'', verified:false},
      ]
    },
    {
      id:'totalenergies', name:'TotalEnergies (Nigeria Upstream)', type:'Major IOC',
      priority:'high', stage:'research', flags:[],
      summary:'Operates the Egina & Akpo FPSOs (OML 130), Amenam/Ikike (OML 99), Ofon (OML 102) and onshore OML 58/Ubeta. The AUSEA drone programme (renewed Aug 2026) proves drone trust in-country — but it covers methane detection only, leaving structural inspection untouched.',
      painPoints:[
        'AUSEA drone programme covers methane detection only — no structural or topside inspection use of drones found',
        'No public leak or integrity-audit data for Egina, Akpo, Amenam, Ofon or Ikike',
        'Akpo down 18% YoY and Egina down 25% YoY (early 2026) amid a resumed drilling/intervention campaign — rising workover activity likely',
        'Subsea/topside inspection is still vessel-and-personnel based (marine surveys, in-house OIMR, SEWOP)'
      ],
      currentSolutions:[
        'AUSEA proprietary methane-detection drone (with CNRS / Univ. of Reims) — emissions only',
        'LOC Group / AqualisBraemar LOC marine warranty surveys (Egina, 2014–2019)',
        'In-house Subsea Support & Intervention Engineers running OIMR vessel campaigns',
        'Rope-access NDE performed in-house'
      ],
      recommended:[
        {sol:'drone', why:'Structural/topside drone inspection is a distinct, unaddressed need alongside the existing emissions-only AUSEA programme.'},
        {sol:'rov', why:'Egina and Akpo FPSO legs, risers and moorings have no confirmed robotic inspection provider.'},
        {sol:'platform', why:'A large, sophisticated buyer already running its own drone R&D — likely to value a data/digital-twin layer over point inspections.'},
      ],
      notes:'Procurement runs through NipeX — vendor pre-qualification is the realistic route in alongside direct outreach.',
      contacts:[
        {name:'Matthieu Bouyer', pos:'Country Chair & MD, TotalEnergies EP Nigeria', email:'', phone:'+234 8039037007 (TEPNG)', linkedin:'', verified:false},
        {name:'Mike Sangster', pos:'SVP Africa, TotalEnergies (former TEPNG MD)', email:'', phone:'', linkedin:'', verified:false},
        {name:'Olurotimi Olubobokun', pos:'Head, Intervention Engineering / Well Integrity Manager', email:'', phone:'', linkedin:'linkedin.com/in/olurotimi-olubobokun-a490941b2', verified:true},
        {name:'Jefferson Udu', pos:'Senior NDE Inspector / Rope Access L3 Supervisor', email:'', phone:'', linkedin:'linkedin.com/in/jefferson-udu', verified:true},
        {name:'Ogechi Aguma, CEng MIMechE', pos:'Inspection domain professional', email:'', phone:'', linkedin:'linkedin.com/in/ogechi-aguma-ceng-mimeche', verified:true},
      ]
    },
    {
      id:'seplat', name:'Seplat Energy Plc', type:'Indigenous — NGX/LSE Listed',
      priority:'high', stage:'contact', flags:[],
      summary:'Dual-listed indigenous major; acquired ExxonMobil’s shallow-water JV (MPNU) Dec 2024 and is now ~70% offshore. Offshore platforms have been onstream since 1970. The Yoho platform fire (Sept 2025) forced a quarter offline.',
      painPoints:[
        'OML 67/68/70 platforms onstream in 1970 (~55 years old); OML 104 (Yoho) from 2002',
        'Yoho Production Platform fire, 27 Sept 2025 — offline all of Q4 2025',
        '70% of the 600+ wells acquired with MPNU were not producing at handover',
        '2026 guidance explicitly flags “planned downtime for strategic maintenance and integrity activities”'
      ],
      currentSolutions:[
        'Corrosion Condition Monitoring Services (NIPEX SEPLAT.00000125) — rope-access + manual/automated NDT, 3yr+2yr, from Q4 2025',
        'Corrosion Control & Prevention Call-Off Services (NIPEX SEPLAT.00000123) — coating, CP, composite wrap',
        'Two offshore integrity barges contracted from Q2 2025 (method undisclosed)',
        'No drone, ROV or robotic crawler mentioned anywhere in current contracts'
      ],
      recommended:[
        {sol:'drone', why:'A topside/flare complement to the existing rope-access NDT contract — positioned as a subcontractor, not a displacement.'},
        {sol:'rov', why:'Yoho and the other 1970-vintage offshore platforms have no confirmed robotic subsea inspection provider.'},
        {sol:'crawler', why:'Existing tank-floor scanning is already API-653 based — a natural robotics upgrade path.'},
      ],
      notes:'Godwin Ibe is a verified, title-matched entry point. Current NIPEX contracts run 3+2 years from Q4 2025 — position as a complementary technology partner rather than a full displacement bid.',
      contacts:[
        {name:'Engr. Effiong Okon, FNSE, FEI', pos:'CEO (from 1 Aug 2026)', email:'', phone:'', linkedin:'', verified:false},
        {name:'Samson Ezugworie', pos:'COO / Executive Director', email:'', phone:'', linkedin:'', verified:false},
        {name:'Eleanor Adaralegbe', pos:'CFO / Executive Director', email:'', phone:'', linkedin:'', verified:false},
        {name:'Dotun Isiaka', pos:'MD, SEPNU/SEPNL (offshore unit)', email:'', phone:'', linkedin:'', verified:false},
        {name:'Ikay Ogunmwonyi', pos:'Director of Production', email:'', phone:'', linkedin:'', verified:false},
        {name:'Godwin Ibe', pos:'Asset Integrity Manager', email:'', phone:'', linkedin:'linkedin.com/in/godwin-ibe-abaa0534', verified:true},
        {name:'Cletus Eze', pos:'Head of Maintenance', email:'', phone:'', linkedin:'', verified:false},
        {name:'Felix Adelabu', pos:'Maintenance Manager, Western Assets', email:'', phone:'', linkedin:'', verified:false},
        {name:'Kola Idris, FCE', pos:'Procurement Manager', email:'', phone:'', linkedin:'linkedin.com/in/kola-idris-fce-1346603a', verified:true},
      ]
    },
    {
      id:'nestoil', name:'Nestoil Ltd', type:'Indigenous EPC Conglomerate',
      priority:'low', stage:'hold',
      flags:[{type:'critical', text:'Contested receivership since Oct 2025 — legal sign-off required before any outreach.'}],
      summary:'Obijackson Group’s EPC/O&M flagship (via IMPAC Engineering) and 45% owner of OML 42 via Neconde. HQ sealed by court order Oct 2025 amid a $1bn+ debt dispute; a Receiver/Manager was appointed and litigation continued into mid-2026.',
      painPoints:[
        'Contracting/signing authority is currently unsettled between company management and the court-appointed Receiver',
        'No specific inspection or integrity contract or technology could be verified publicly',
        'OML 42 technical condition is undisclosed — all coverage is legal/receivership-focused'
      ],
      currentSolutions:[
        'No named inspection-robotics vendor or technology identified',
        'EWT fabrication arm holds ISO 9001:2015 / ASME stamps — a construction, not inspection, orientation'
      ],
      recommended:[],
      notes:'Do not pursue commercially until Aerosub’s legal/sales leadership confirms counterparty authority. If pursued later, IMPAC Engineering (the O&M subsidiary) is the natural channel-partner entry point rather than direct contracting.',
      contacts:[
        {name:'Dr. Ernest Nnaemeka Azudialu-Obiejesi OFR', pos:'Chairman & Group CEO', email:'', phone:'', linkedin:'', verified:false},
        {name:'Nnenna Obiejesi', pos:'Group Executive Director', email:'', phone:'', linkedin:'', verified:false},
        {name:'Frank Ogholaja', pos:'Chief Financial Officer', email:'', phone:'', linkedin:'', verified:false},
        {name:'Pamela Osanakpo', pos:'Group Head, Corporate Communications', email:'p.Osanakpo@nestoilgroup.com', phone:'', linkedin:'', verified:false},
      ]
    },
    {
      id:'geil', name:'Green Energy International', type:'Indigenous — Private',
      priority:'medium', stage:'contact', flags:[],
      summary:'Builder/operator of the Otakikpo terminal (OML 11) — Nigeria’s first indigenous onshore crude export terminal in 50+ years, commissioned Oct 2025. The brand-new offshore export system (SPM/SAL, PLEM, subsea pipeline) is a strong ROV fit.',
      painPoints:[
        'Offshore SPM/SAL buoy, PLEM and subsea pipeline require periodic ROV inspection — no current provider identified',
        'Pipeline network is designed for pigging (ILI) only — no drone or robotic layer found',
        'Swampy, creek-dominated Andoni LGA terrain is difficult for ground crews'
      ],
      currentSolutions:[
        'Oilserv Limited built the entire pipeline/terminal system (EPCIC contractor, not an inspection vendor)',
        'No dedicated inspection-robotics vendor identified'
      ],
      recommended:[
        {sol:'rov', why:'Direct match to the new SPM/SAL buoy, PLEM and subsea pipeline — no incumbent inspection provider found.'},
        {sol:'drone', why:'Pipeline and terminal topside monitoring across a difficult creek/swamp right-of-way.'},
      ],
      notes:'Olawale Adenuga’s title explicitly combines Operations and Asset Integrity — the strongest named contact across all ten accounts. Lead with him.',
      contacts:[
        {name:'Prof. Anthony O. Adegbulugbe', pos:'Chairman & CEO', email:'', phone:'', linkedin:'', verified:false},
        {name:'Olawale Adenuga, PhD, MBA', pos:'Group GM, Operations & Asset Integrity', email:'@greenenergy.ng (address masked)', phone:'', linkedin:'ng.linkedin.com/in/olawale-adenuga-87555742', verified:true},
        {name:'Chuks Igbokwe', pos:'Manager, Environment, Health & Safety', email:'@greenenergy.ng (address masked)', phone:'', linkedin:'', verified:false},
        {name:'Eyo Luke Okon-Eyo', pos:'GM, Fields Development', email:'@greenenergy.ng (address masked)', phone:'', linkedin:'ng.linkedin.com/in/eyo-okon-eyo-31bb88170', verified:true},
        {name:'James Odunuga', pos:'GM, Subsurface', email:'@greenenergy.ng (address masked)', phone:'', linkedin:'', verified:false},
        {name:'Opeyemi Fagbola', pos:'Legal Counsel', email:'', phone:'', linkedin:'', verified:false},
      ]
    },
    {
      id:'renaissance', name:'Renaissance Africa Energy', type:'Consortium — former Shell SPDC JV',
      priority:'high', stage:'contact',
      flags:[{type:'info', text:'Related account: Aradel holds an effective 53.3% stake in this consortium — coordinate outreach with the Aradel account.'}],
      summary:'Nigerian-led consortium (Aradel, ND Western, First E&P, Waltersmith, Petrolin) that acquired Shell’s onshore JV (SPDC) in March 2025 — 18 OMLs, the Bonny & Forcados terminals, and the Sea Eagle FPSO. Inherited a documented ~750-task maintenance backlog and hundreds of unaccounted-for wells.',
      painPoints:[
        'Leaked internal Shell documents: ~750 overdue maintenance tasks and hundreds of unaccounted-for onshore wells',
        'One legacy pipeline segment was internally described by Shell (2014) as “a basket” — six spills since 2010',
        '4 of 10 NOSDRA-logged Niger Delta spills in July 2026 alone were attributed to Renaissance',
        'Basin-wide sabotage/theft makes manned pipeline inspection costly and hazardous'
      ],
      currentSolutions:[
        '2024 USV pipeline-route survey at Bonny (Compass Survey + Unmanned Survey Solutions/UK) — a one-off Shell-era pilot, unclear if continued',
        'Undisclosed drone vendor for a 2022 pipeline/wellhead surveillance initiative',
        'Daily helicopter patrols and wellhead protective cages',
        'Risk-Based Inspection referenced in job postings — manual/contracted, not in-house robotic'
      ],
      recommended:[
        {sol:'drone', why:'Pipeline right-of-way monitoring directly addresses the documented 750-task maintenance backlog.'},
        {sol:'crawler', why:'Onshore tank and vessel inspection across 18 OMLs of legacy infrastructure.'},
        {sol:'rov', why:'The Sea Eagle FPSO has no confirmed subsea inspection provider under the new operator.'},
      ],
      notes:'Two live NIPEX tenders are directly relevant: Offshore Positioning/Inspection/Seabed Survey Services, and Safety & Environment Support Services (SE Inspection scope, Q3 2026 start).',
      contacts:[
        {name:'Tony Attah', pos:'Managing Director & CEO', email:'', phone:'', linkedin:'', verified:false},
        {name:'Dr. Layi Fatona', pos:'Chairman, Board of Directors', email:'', phone:'', linkedin:'', verified:false},
        {name:'Dr. Igo Weli', pos:'VP, Relations and Sustainable Development', email:'', phone:'', linkedin:'', verified:false},
        {name:'Elozino Olaniyan', pos:'GM, Safety and Environment (IOGP representative)', email:'', phone:'', linkedin:'', verified:false},
        {name:'Peremobowei Boubou', pos:'Senior Supervisor, Integrity Management System Lead', email:'@raecafrica.com (address masked)', phone:'', linkedin:'', verified:false},
        {name:'Essiet Charles', pos:'Senior Operations Readiness Engineer', email:'@raecafrica.com (address masked)', phone:'', linkedin:'', verified:false},
        {name:'Mina Allison', pos:'Senior Pipeline Integrity & Capacity Engineer', email:'', phone:'', linkedin:'', verified:false},
      ]
    },
    {
      id:'nlng', name:'NLNG (Nigeria LNG Limited)', type:'JV — NNPC / Shell / TotalEnergies / Eni',
      priority:'high', stage:'research', flags:[],
      summary:'Bonny Island LNG plant, six trains (~27 years old) plus Train 7 (90%+ complete, targeting mid-2027 commissioning). The clearest confirmed drone relationship of all ten IOCs (Arco Worldwide Services, since 2020) — but scoped to pipeline security, not plant-asset integrity.',
      painPoints:[
        '“Asset rejuvenation programme” language signals aging-plant concern across six operating trains',
        'No public methodology found for storage-tank, flare-stack or jetty/marine-structure inspection',
        'LNG tank confined-space entry is inherently high-risk (asphyxiation, cold injury, explosive atmosphere)',
        'Ardrend Limited (robotic tank-cleaning competitor) already exhibited at NLNG’s own 2026 vendor event — the window is open now'
      ],
      currentSolutions:[
        'Arco Worldwide Services (AWS) — VTOL drone pipeline right-of-way surveillance since 2020; Mobile Drone Operations Command Centre launched Feb 2026',
        'Train 7 EPC (Saipem/Chiyoda/Daewoo) run their own construction-phase NDT',
        'No confirmed plant, tank or flare robotic inspection vendor'
      ],
      recommended:[
        {sol:'crawler', why:'Direct competitive response to Ardrend — zero-man tank cleaning/inspection is already on NLNG’s radar.'},
        {sol:'drone', why:'Flare-stack and jetty inspection, complementary to AWS’s security-only drone scope.'},
        {sol:'platform', why:'Turnaround-cycle inspection data trending across six trains plus the incoming Train 7.'},
      ],
      notes:'No named Asset Integrity contact — approach via Vendor Management Services (vendorservices@nlng.com) and request the correct Technical Division contact. Watch NLNG’s annual “Partners Leadership Exhibition” as a relationship venue.',
      contacts:[
        {name:'Adeleye Falade, FNSE', pos:'Managing Director & CEO', email:'', phone:'', linkedin:'', verified:false},
        {name:'Ekeinde Ohiwerei', pos:'GM, Corporate Services', email:'', phone:'', linkedin:'ng.linkedin.com/in/ekeinde-ohiwerei-b75a4236', verified:true},
        {name:'Nnamdi Anowi', pos:'GM, Production', email:'', phone:'', linkedin:'ng.linkedin.com/in/nnamdi-anowi', verified:true},
        {name:'Sophia Horsfall', pos:'GM, External Relations and Sustainable Development', email:'', phone:'', linkedin:'', verified:false},
        {name:'Vendor Management Services', pos:'CPM Department (general procurement contact)', email:'vendorservices@nlng.com', phone:'+234 803 907 4000', linkedin:'', verified:false},
      ]
    },
    {
      id:'aradel', name:'Aradel Holdings Plc', type:'Indigenous — NGX Listed',
      priority:'medium', stage:'contact',
      flags:[{type:'info', text:'Related account: effectively controls Renaissance (53.3% indirect stake, Jan 2026) — coordinate outreach with the Renaissance account.'}],
      summary:'Largest oil & gas company on NGX by market cap. Flagship Ogbele field (OML 54) has produced since 2005, plus OML 34, Omerelu and a modular refinery. Runs a formal in-house Risk-Based Inspection programme and an SAP S/4HANA digital-transformation project.',
      painPoints:[
        'Inspection approach is a traditional, engineering-staff-led RBI programme — no drone/ROV/crawler evidence found',
        'No dedicated “Asset Integrity Manager” identified — the function appears to sit under the Group CTO',
        'Now effectively controls Renaissance’s much larger, higher-risk legacy asset base'
      ],
      currentSolutions:[
        'In-house Risk-Based Inspection (RBI) programme — no named NDT/software OEM',
        'SAP S/4HANA ERP + SAP Ariba (recommended) — digital procurement, not inspection',
        'No named drone, ROV or crawler vendor identified'
      ],
      recommended:[
        {sol:'platform', why:'Their own RBI and SAP digital-transformation investment shows real appetite for structured digital reporting.'},
        {sol:'crawler', why:'Ogbele and Omerelu tank/vessel inspection — no robotics vendor currently identified.'},
      ],
      notes:'Lead with Dr. Ebenezer Ageh (Group CTO) — frame the pitch around their existing RBI and digital-transformation investments.',
      contacts:[
        {name:'Adegbite ("Gbite") Falade', pos:'MD / CEO', email:'', phone:'', linkedin:'', verified:false},
        {name:'Adegbola Adesina', pos:'CFO / Finance Director', email:'', phone:'', linkedin:'', verified:false},
        {name:'Dr. Ebenezer Ageh', pos:'Group Chief Technical Officer', email:'', phone:'', linkedin:'linkedin.com/in/dr-ebenezer-ageh-51a13013', verified:true},
        {name:'Temitayo Ogunbanjo', pos:'General Manager, Refineries', email:'', phone:'', linkedin:'ng.linkedin.com/in/temitayo-ogunbanjo', verified:true},
        {name:'Femi Olaniyan', pos:'General Manager, Engineering and Projects', email:'', phone:'', linkedin:'', verified:false},
        {name:'Chukwuma Nkwodinmah', pos:'Head of Supply Chain Management', email:'', phone:'', linkedin:'ng.linkedin.com/in/chukwumankwodinmah01', verified:true},
      ]
    },
    {
      id:'frontier', name:'Frontier Oil Ltd', type:'Indigenous — Private, small',
      priority:'low', stage:'research', flags:[],
      summary:'Small indigenous operator of the Uquo oil side (PML 10, ~66–70 staff). The Uquo gas plant itself is operated by Savannah Energy/Accugas, not Frontier — a parallel target.',
      painPoints:[
        'No public documentation of how wells, flowlines or the shared FUN evacuation pipeline are inspected',
        'Onshore creek/swamp/mangrove terrain is difficult for foot/boat right-of-way patrol',
        'No named Asset Integrity, Inspection or Maintenance title-holder found at all'
      ],
      currentSolutions:[
        'Emval Nigeria Limited — well integrity/workover services (downhole, not topside)',
        'No drone, ROV or crawler vendor identified'
      ],
      recommended:[
        {sol:'drone', why:'Low-cost entry point: pipeline and flowline monitoring for a small operator with limited budget.'},
      ],
      notes:'Small budget likely — treat as a long-tail, low-effort account. Also track Savannah Energy/Accugas as the real buyer for the Uquo gas-plant side.',
      contacts:[
        {name:'Engr. Dada Thomas, FNSChE, P.Eng', pos:'Founding CEO / Managing Director', email:'', phone:'', linkedin:'linkedin.com/in/dada-thomas-780bb237', verified:true},
        {name:'Promise Egele', pos:'Technical Director', email:'', phone:'', linkedin:'', verified:false},
        {name:'Oluwole ("Wole") Adefila', pos:'Operations Director', email:'', phone:'', linkedin:'linkedin.com/in/wole-adefila-948a29a1', verified:true},
        {name:'Emmanuel Idemudia', pos:'Supply Chain Management', email:'', phone:'', linkedin:'linkedin.com/in/emmanuel-idemudia-80538b315', verified:true},
      ]
    },
    {
      id:'oriental', name:'Oriental Energy Resources', type:'Indigenous — Private, family-controlled',
      priority:'medium', stage:'research', flags:[],
      summary:'Family-controlled operator of Ebok (100M+ bbl cumulative, the largest offshore ESP deployment in West Africa) and the newly-commissioning Okwok/EMEM FPSO. Ebok’s FSO is being replaced in 2026 after a 2018 life-extension programme.',
      painPoints:[
        'FSO Virini Prem (in service since 2010) underwent statutory life-extension around 2018 and is only now being retired (2026)',
        'The EMEM FPSO for Okwok will need a full commissioning inspection baseline once hooked up — no current subsea contractor identified',
        'No public evidence of drone/UAV topside, tank or flare-stack inspection anywhere in the portfolio'
      ],
      currentSolutions:[
        'HBA Future Energy (Singapore) + WCP — EMEM FPSO lease-and-operate O&M',
        'Marine Platforms Limited performed Ebok-area subsea completions during the Afren era (pre-2015) — current status unconfirmed',
        'No named drone, digital-twin or crawler vendor identified'
      ],
      recommended:[
        {sol:'rov', why:'EMEM commissioning baseline plus ongoing Ebok subsea inspection — no confirmed current provider.'},
        {sol:'cleaning', why:'Aging FSO hull and marine-growth management ahead of the 2026 replacement.'},
      ],
      notes:'No named Asset Integrity contact — the Well Engineering Manager or Deputy EHSS Manager are the closest functional entry points.',
      contacts:[
        {name:'Alhaji (Dr.) Muhammadu Indimi, OFR', pos:'Founder, Executive Chairman & CEO', email:'', phone:'', linkedin:'', verified:false},
        {name:'Mustafa Indimi', pos:'Managing Director', email:'', phone:'', linkedin:'ng.linkedin.com/in/mustafa-indimi-a628ba109', verified:true},
        {name:'Taiwo Olushina', pos:'Chief Operating Officer', email:'', phone:'', linkedin:'', verified:false},
        {name:'Abraham Faga', pos:'Well Engineering Manager', email:'', phone:'', linkedin:'linkedin.com/in/abraham-faga-07753914', verified:true},
        {name:'Iderimo Akene', pos:'Deputy EHSS Manager', email:'', phone:'', linkedin:'linkedin.com/in/iderimo-akene-iirsm-iasp-wso-nebosh-igc-iso-certified-037a6252', verified:true},
        {name:'Kayode Onasile', pos:'Senior Manager, Supply Chain Management & Base Manager', email:'', phone:'', linkedin:'', verified:false},
      ]
    },
  ];

  // stamp ids
  companies.forEach(c=>{
    c.contacts.forEach((ct,i)=>{ ct.id = c.id+'-c'+i; ct.companyId=c.id; ct.lastContact=''; ct.nextFollowUp=''; });
  });

  const today = new Date(); const iso = d => d.toISOString().slice(0,10);
  const plus = n => { const d=new Date(today); d.setDate(d.getDate()+n); return iso(d); };
  const minus = n => { const d=new Date(today); d.setDate(d.getDate()-n); return iso(d); };

  const tasks = [
    {id:'t1', title:'Legal review of Nestoil receivership before any outreach', companyId:'nestoil', due:plus(2), priority:'high', done:false},
    {id:'t2', title:'Align Aradel + Renaissance outreach plan (shared ownership)', companyId:'aradel', due:plus(4), priority:'high', done:false},
    {id:'t3', title:'Complete NIPEX vendor pre-qualification', companyId:'', due:plus(10), priority:'high', done:false},
    {id:'t4', title:'LinkedIn outreach to Olawale Adenuga, GEIL', companyId:'geil', due:plus(1), priority:'high', done:false},
    {id:'t5', title:'LinkedIn outreach to Godwin Ibe, Seplat', companyId:'seplat', due:plus(1), priority:'high', done:false},
    {id:'t6', title:'LinkedIn outreach to Elozino Olaniyan, Renaissance', companyId:'renaissance', due:plus(3), priority:'medium', done:false},
    {id:'t7', title:'LinkedIn outreach to Dr. Ebenezer Ageh, Aradel', companyId:'aradel', due:plus(3), priority:'medium', done:false},
    {id:'t8', title:'Draft enquiry to NLNG Vendor Management Services — tank-cleaning robotics angle', companyId:'nlng', due:plus(6), priority:'medium', done:false},
    {id:'t9', title:'Track next NLNG Partners Leadership Exhibition date', companyId:'nlng', due:plus(30), priority:'low', done:false},
    {id:'t10', title:'Watch Seplat CCM/CCP contract extension decision point (~2028)', companyId:'seplat', due:plus(60), priority:'low', done:false},
    {id:'t11', title:'Confirm current signing authority at Nestoil before any re-engagement', companyId:'nestoil', due:minus(1), priority:'high', done:false},
    {id:'t12', title:'Prepare Renaissance NIPEX tender response — Offshore Inspection & Seabed Survey', companyId:'renaissance', due:plus(14), priority:'high', done:false},
  ];

  const competitors = [
    {id:'cyberhawk', name:'Cyberhawk (an Ondas company)', hq:'UK / USA / Qatar', modality:'Drone', threat:'Adjacent', website:'thecyberhawk.com',
      notes:'Premium, technology-led asset-integrity data platform (iHawk). Highest price tier of the drone players researched. Not confirmed active in Nigeria — the main risk is if they enter via a supermajor framework agreement.',
      campaigns:[
        {id:'c1', title:'Partnership with Skygauge Robotics for contact-UT thrust-vectoring drones', type:'Current', date:'2024-01-01', sourceUrl:'https://thecyberhawk.com/news/cyberhawk-partners-with-skygauge-robotics-to-deliver-cutting-edge-ultrasonic-thickness-inspections-to-customers-globally', relevance:'Direct overlap', summary:'Adds contact-UT capability to their drone line — claimed 5–20x faster and up to 95% cheaper than rope access. Directly overlaps with Aerosub\'s aerial + crawler UT positioning.',
          performance:'Actively marketed globally through 2024–25, positioned as a premium upgrade path — no specific win/loss data disclosed.',
          gap:'No confirmed Nigeria presence or local-content story.',
          sweetSpot:'Nigeria/West Africa itself — their cost premium and lack of local presence leaves room for a locally-delivered equivalent.',
          verdict:'partner'},
        {id:'c2', title:'Five-year drone inspection & survey contract with a major Middle East LNG producer', type:'Current', date:'2024-06-01', sourceUrl:'https://thecyberhawk.com/oil-gas-marine', relevance:'Watch', summary:'Shows appetite for long-term LNG framework agreements — relevant precedent given NLNG is one of our own target accounts.',
          performance:'Won and running — a live long-term reference account proving LNG-scale drone contracts of this size exist.',
          gap:'No African LNG account (yet).',
          sweetSpot:'Use this exact precedent in our own NLNG pitch, then differentiate on local delivery and price.',
          verdict:'avoid'},
      ]},
    {id:'future3d', name:'THE FUTURE 3D', hq:'Nigeria', modality:'Drone', threat:'Direct', website:'thefuture3d.com',
      notes:'Broadest verified IOC/NOC client list of any Nigerian drone player (states Shell, Total, Chevron, ExxonMobil, NNPC, Seplat, Oando). Positions on 24-hour response and fast mobilisation.',
      campaigns:[
        {id:'c1', title:'Reality-capture & drone survey services across Nigeria\'s six geopolitical zones', type:'Current', date:'2025-01-01', sourceUrl:'https://www.thefuture3d.com/locations/nigeria/', relevance:'Direct overlap', summary:'Trimble X12 + DJI Matrice 350 RTK + LiDAR stack. Single-modality (drone only) — no ROV or crawler line, unlike Aerosub.',
          performance:'Established, ongoing service with a broad blue-chip client list — the most credible single-modality drone competitor in-market.',
          gap:'Drone only — no ROV or crawler, so they cannot respond to a bundled multi-domain scope alone.',
          sweetSpot:'Any account wanting subsea or confined-space work alongside drone — a bundled RFP structurally excludes them.',
          verdict:'complement'},
      ]},
    {id:'aerialrobotix', name:'Aerial Robotix', hq:'Lagos, Nigeria', modality:'Drone', threat:'Direct', website:'aerial-robotix.com',
      notes:'Operating since 2016. States it pioneered BVLOS drone operations in Nigeria, monitoring up to 500km from base.',
      campaigns:[
        {id:'c1', title:'BVLOS pipeline/asset monitoring + OGI methane inspection line', type:'Current', date:'2025-01-01', sourceUrl:'https://aerial-robotix.com/', relevance:'Direct overlap', summary:'Long-range BVLOS pipeline surveillance plus flare/tank/pipeline asset-integrity inspection. Reported partnership with Tekever AR3.',
          performance:'Established, credible operator on BVLOS surveillance/monitoring since 2016.',
          gap:'Positioning is monitoring/surveillance-led — no claimed engineering-grade NDT/defect-quantification depth.',
          sweetSpot:'Structural, UT-grade inspection work where a surveillance-only offering falls short.',
          verdict:'complement'},
      ]},
    {id:'arco', name:'ARCO Worldwide Services', hq:'Lagos, Nigeria', modality:'Drone', threat:'Direct', website:'arcoworldwide.com',
      notes:'NLNG\'s confirmed drone partner since 2020 — the single clearest incumbent relationship found anywhere in our research. A live account risk at NLNG specifically.',
      campaigns:[
        {id:'c1', title:'NLNG Mobile Drone Operations Command Centre (MDOC) launch', type:'Current', date:'2026-02-01', sourceUrl:'https://www.arise.tv/nlng-arco-launch-nigerias-first-mobile-drone-control-system-in-rivers/', relevance:'Direct overlap', summary:'Retrofitted Sprinter van + "Sky Whale" VTOL drone for pipeline right-of-way security. Scoped to security/surveillance, not structural inspection — our opening is still there.',
          performance:'Live, growing relationship at NLNG since 2020, just expanded Feb 2026 — strong incumbency on this specific scope.',
          gap:'Scoped to pipeline security surveillance only — no evidence of structural or asset-integrity inspection capability.',
          sweetSpot:'NLNG\'s tank, flare-stack and jetty inspection — a completely different budget line, untouched by this relationship.',
          verdict:'complement'},
      ]},
    {id:'fugro', name:'Fugro (Fugro RUE AS / Subsea Services)', hq:'Netherlands, West Africa network', modality:'ROV', threat:'Adjacent', website:'fugro.com',
      notes:'Global geo-data major with ~50 vessels / ~160 ROVs group-wide. 20-year Nigerian incumbency since 2005. Not price-competitive for smaller scopes — a large-framework risk, not a small-deal one.',
      campaigns:[
        {id:'c1', title:'IRM air-diving/topside services for Shell/SPDC on Forcados & Bonny (origin contract)', type:'Past', date:'2005-01-01', sourceUrl:'https://energy-oil-gas.com/news/fugro-rue-as-leading-subsea-services-in-norway-and-west-africa/', relevance:'Watch', summary:'Establishes their depth of incumbency on exactly the legacy Shell/Renaissance assets we are targeting.',
          performance:'20-year incumbency, deep resource base (~50 vessels / ~160 ROVs group-wide) — the regional benchmark for ROV/subsea scale.',
          gap:'Not price-competitive for smaller scopes; likely slower and costlier to mobilise for a single-platform job.',
          sweetSpot:'Small-to-mid-scope ROV inspection jobs beneath their minimum deal size.',
          verdict:'avoid'},
      ]},
    {id:'tscsubsea', name:'TSC Subsea + SubseaRobotix', hq:'UK/global + West Africa-focused', modality:'ROV', threat:'Direct', website:'tscsubsea.com',
      notes:'2023-announced tech-transfer partnership pairing international NDT technique depth with a regional operator — a template Aerosub itself could copy for advanced NDT capability.',
      campaigns:[
        {id:'c1', title:'Partnership announced to bring advanced NDT/structural-integrity inspection to Nigeria\'s offshore sector', type:'Current', date:'2023-11-01', sourceUrl:'https://www.bindt.org/News/november-2023/tsc-subsea-and-subsearobotix-bring-combined-expertise-to-nigerias-subsea-inspection-market/', relevance:'Direct overlap', summary:'Explicitly targets "aging infrastructure" across Nigeria/West Africa — the same demand driver behind our own pitch.',
          performance:'Partnership announced Nov 2023, explicitly targeting aging Nigerian infrastructure — still early, no confirmed contract awards found.',
          gap:'A newly-formed partnership, not yet a proven local track record.',
          sweetSpot:'The same aging-infrastructure accounts (Renaissance, Seplat) — move before they establish a track record there.',
          verdict:'compete'},
      ]},
    {id:'marineplatforms', name:'Marine Platforms Limited', hq:'Lagos, Nigeria', modality:'ROV', threat:'Direct', website:'marineplatforms.com',
      notes:'The most directly relevant indigenous incumbent identified in our entire research exercise — confirmed OIMR contracts with Shell (Bonga) and TotalEnergies (Akpo, Egina), both companies we are also pursuing.',
      campaigns:[
        {id:'c1', title:'OIMR contracts with Shell (Bonga) and TotalEnergies (Akpo, Egina); historical Ebok-area work for Oriental Energy', type:'Current', date:'2025-01-01', sourceUrl:'https://marineplatforms.com/services-1/subsea-solutions/', relevance:'Direct overlap', summary:'Work-class ROVs to 10,000+ ft. Directly overlaps with our TotalEnergies and Oriental Energy targeting — verify current contract status before proposing there.',
          performance:'Confirmed, live OIMR contracts with Shell (Bonga) and TotalEnergies (Akpo, Egina) — the strongest indigenous ROV incumbent found in this research.',
          gap:'No confirmed drone or crawler capability — ROV/subsea only.',
          sweetSpot:'Bundled inspection scopes spanning topside (drone) + confined-space (crawler) alongside subsea — they\'d need to subcontract those pieces to us.',
          verdict:'complement'},
      ]},
    {id:'gecko', name:'Gecko Robotics', hq:'USA, global', modality:'Crawler', threat:'Adjacent', website:'geckorobotics.com',
      notes:'AI + wall-climbing robots feeding the Cantilever data platform. Client logos include ADNOC, Marathon, HF Sinclair — proves NOC-scale reach elsewhere. No confirmed Nigeria deployment — the clearest whitespace flag in the whole competitive set.',
      campaigns:[
        {id:'c1', title:'Case study: "global oil and gas leader" saved $1M in tank-shell costs, cut inspection time from 5 weeks to 3 days', type:'Past', date:'2024-01-01', sourceUrl:'https://www.geckorobotics.com/oil-and-gas', relevance:'Watch', summary:'If they enter Nigeria, their Cantilever data platform is the closest thing to our own "Digital Asset-Integrity Platform" product — worth monitoring for signs of a Nigeria/West Africa push.',
          performance:'Proven ROI case study (5 weeks → 3 days, $1M saved) with blue-chip references (ADNOC, Marathon, HF Sinclair) — a credible global leader.',
          gap:'No confirmed Nigeria/West Africa deployment — the clearest whitespace in the entire competitive set.',
          sweetSpot:'Be the first mover on a Cantilever-style data platform for Nigerian/West African accounts before they arrive.',
          verdict:'watch'},
      ]},
    {id:'petrobot', name:'PetroBot', hq:'India-headquartered, active in Nigeria', modality:'Crawler', threat:'Direct', website:'petrobot-global.com/ng',
      notes:'India/ONGC-HPCL funded robotic tank-inspection specialist with a dedicated Nigeria service line — proof that non-Western entrants are actively targeting this niche too, not just UK/US firms.',
      campaigns:[
        {id:'c1', title:'ITIS Rover + MagRover in-service tank inspection, Nigeria service line launched', type:'Current', date:'2025-01-01', sourceUrl:'https://petrobot-global.com/ng/services/tank-inspection', relevance:'Direct overlap', summary:'ATEX/PESO certified, API 653-aligned. Directly competes with our Crawler Confined-Space Inspection product at any tank-owning account (NLNG, Aradel, Seplat).',
          performance:'Actively pushing into Nigeria with a dedicated local service line and India/ONGC-HPCL-backed R&D credibility.',
          gap:'No named Nigerian clients found yet — still building initial local references.',
          sweetSpot:'Tank-owning accounts (NLNG, Aradel, Seplat) — move before PetroBot lands its first Nigerian reference contract.',
          verdict:'compete'},
      ]},
    {id:'ardrend', name:'Ardrend Limited', hq:'Nigeria, sub-Saharan Africa', modality:'Crawler', threat:'Direct', website:'ardrend.com',
      notes:'The clearest genuinely indigenous player in the robotic tank-cleaning niche. Already has a relationship-building foothold at NLNG — our most time-sensitive competitive risk.',
      campaigns:[
        {id:'c1', title:'Exhibited at NLNG\'s 10th "Partners Leadership Exhibition"', type:'Current', date:'2026-01-01', sourceUrl:'https://www.linkedin.com/posts/ardrend-limited_robotictankcleaning-ardrendlimited-nlng-activity-7444424615558348801-Lhze', relevance:'Direct overlap', summary:'First NUPRC-approved provider of zero-man robotic tank cleaning/inspection in Nigeria. No confirmed contract award yet — this is a live, closing window at NLNG.',
          performance:'First NUPRC-approved zero-man tank robotics provider in Nigeria, actively exhibiting at NLNG\'s own vendor event — strong early positioning, no confirmed contract award yet.',
          gap:'Small, single-modality (crawler/tank) player — no drone or ROV line.',
          sweetSpot:'A broader multi-domain pitch at NLNG that a tank-only specialist can\'t match — or focus effort on accounts where they haven\'t built a foothold.',
          verdict:'compete'},
      ]},
  ];
  competitors.forEach(co=>{ co.campaigns.forEach((cp,i)=>{ cp.id = co.id+'-cp'+i; }); });

  const news = [
    {id:'n1', title:'NLNG, Arco launch Nigeria\'s first mobile drone control system', source:'Arise TV', url:'https://www.arise.tv/nlng-arco-launch-nigerias-first-mobile-drone-control-system-in-rivers/', date:plus(-3), kind:'company', refId:'nlng'},
    {id:'n2', title:'TotalEnergies, NNPC renew AUSEA drone partnership for 24 months', source:'Brandiconimage', url:'https://www.brandiconimage.com/2026/06/totalenergies-nnpc-renew-ausea-drone.html', date:plus(-5), kind:'company', refId:'totalenergies'},
    {id:'n3', title:'Ten oil spills recorded in Niger Delta in July — NOSDRA data', source:'AllAfrica', url:'https://allafrica.com/stories/202608110134.html', date:plus(-4), kind:'company', refId:'renaissance'},
    {id:'n4', title:'Cyberhawk partners with Skygauge Robotics for contact-UT drone inspection', source:'Cyberhawk', url:'https://thecyberhawk.com/news/cyberhawk-partners-with-skygauge-robotics-to-deliver-cutting-edge-ultrasonic-thickness-inspections-to-customers-globally', date:plus(-8), kind:'product', refId:'drone'},
    {id:'n5', title:'Seplat CEO: independents must fix obsolescence and target 95% uptime', source:'EnviroNews Nigeria', url:'https://www.environewsnigeria.com/asset-integrity-life-extension-fixing-obsolescence-key-to-sustaining-value-for-independents-seplat-ceo/', date:plus(-2), kind:'company', refId:'seplat'},
    {id:'n6', title:'NLNG Train 7 hits 92% completion, nears pre-commissioning', source:'ThisDay', url:'https://www.thisdaylive.com/2026/05/21/5bn-nlng-train-7-hits-92-completion-nears-pre-commissioning-as-local-capacity-grows/', date:plus(-10), kind:'company', refId:'nlng'},
  ];

  const research = [];

  const events = [
    {id:'adipec2026', name:'ADIPEC 2026', organizer:'ADNOC / dmg events', location:'Abu Dhabi, UAE',
      startDate:'2026-11-09', endDate:'2026-11-12', cost:'~$2,500–5,000 delegate pass; exhibition stand from ~$15,000 (approx. — confirm with organizer)', currency:'USD',
      website:'adipec.com',
      benefits:['The largest global O&G exhibition — direct access to OEMs, majors and NOCs from outside West Africa',
                 'Where global robotics/inspection players (Gecko Robotics, Cyberhawk-tier competitors) exhibit — high-value competitive intelligence',
                 'Strong venue for scouting OEM/technology-transfer partners (subsea tooling, NDT sensor makers)'],
      attendees:[{name:'TotalEnergies (global)', companyId:'totalenergies', status:'Likely attends'}, {name:'Major OEMs / robotics vendors', companyId:'', status:'Exhibiting'}],
      notes:'Dates are typical scheduling for this recurring event — confirm exact 2026 dates against adipec.com before booking travel.'},
    {id:'nog2027', name:'NOG Energy Week 2027', organizer:'Nigeria Oil & Gas / Ministry of Petroleum Resources', location:'Abuja, Nigeria',
      startDate:'2027-02-22', endDate:'2027-02-26', cost:'~$800–1,500 delegate pass (approx. — confirm with organizer)', currency:'USD',
      website:'nigeriaoilandgas.com',
      benefits:['The single most important Nigerian upstream event — nearly every IOC on our account list typically attends',
                 'Direct face time with NUPRC/NCDMB regulators — relevant to vendor pre-qualification and local-content positioning',
                 'High density of decision-makers in one place — efficient way to advance several accounts in a single trip'],
      attendees:[{name:'Most Nigerian IOCs/NOCs', companyId:'', status:'Typically attends'}],
      notes:'Illustrative date based on typical Feb/March scheduling — confirm against the official site once announced.'},
    {id:'naice2027', name:'SPE NAICE 2027', organizer:'Society of Petroleum Engineers (Nigeria Council)', location:'Lagos, Nigeria',
      startDate:'2027-08-03', endDate:'2027-08-05', cost:'~$500–1,200 delegate pass (approx. — confirm with organizer)', currency:'USD',
      website:'spenaice.org',
      benefits:['Technical/engineering-led audience — a strong fit for Aerosub\'s "engineering-grade analysis" positioning, not just a sales floor',
                 'Seplat\'s CEO spoke on asset integrity and obsolescence at NAICE 2026 — this audience is already primed for our exact pitch',
                 'Good venue for panel/speaking-slot visibility rather than just a booth'],
      attendees:[{name:'Seplat Energy', companyId:'seplat', status:'Spoke in 2026 — likely returns'}, {name:'Aradel Holdings', companyId:'aradel', status:'Likely attends'}],
      notes:'Illustrative date based on the August 2026 edition — confirm against spenaice.org once the 2027 dates are published.'},
    {id:'nies2027', name:'Nigeria International Energy Summit (NIES) 2027', organizer:'NIES Secretariat / NUPRC', location:'Abuja, Nigeria',
      startDate:'2027-07-13', endDate:'2027-07-16', cost:'~$600–1,200 delegate pass (approx. — confirm with organizer)', currency:'USD',
      website:'niessummit.com',
      benefits:['TotalEnergies presented its Nigeria strategy at NIES 2026, and Aradel won "Best Full-Field Integrated Operator" there — high-visibility for both target accounts',
                 'Strong policy/strategy focus — good for relationship-building with leadership rather than technical buyers'],
      attendees:[{name:'TotalEnergies', companyId:'totalenergies', status:'Presented in 2026'}, {name:'Aradel Holdings', companyId:'aradel', status:'Award winner 2026'}],
      notes:'Illustrative date — confirm against the official NIES site once the 2027 schedule is published.'},
    {id:'otc2027', name:'Offshore Technology Conference (OTC) 2027', organizer:'OTC / Energy4Sea', location:'Houston, USA',
      startDate:'2027-05-03', endDate:'2027-05-06', cost:'~$1,500–3,000 delegate pass; exhibition space from ~$40/sq ft (approx. — confirm with organizer)', currency:'USD',
      website:'otcnet.org',
      benefits:['The global benchmark event for offshore/subsea technology — best single venue for ROV, crawler and marine-growth-cleaning OEM partnerships',
                 'Where players like Fugro, Oceaneering and Gecko Robotics showcase new capability — direct competitive intelligence',
                 'Useful for benchmarking Aerosub\'s own technology roadmap against the state of the art'],
      attendees:[{name:'Global subsea/ROV OEMs', companyId:'', status:'Exhibiting'}],
      notes:'OTC is consistently held in early May — confirm exact 2027 dates against otcnet.org.'},
    {id:'nlngexpo2027', name:'NLNG & Partners Leadership Exhibition (11th edition)', organizer:'Nigeria LNG Limited', location:'Port Harcourt, Nigeria',
      startDate:'2027-03-01', endDate:'2027-03-02', cost:'Vendor exhibition — cost typically covers stand/booth only (confirm with NLNG Vendor Management Services)', currency:'USD',
      website:'nlng.com',
      benefits:['Direct vendor-relationship-building venue at one of our highest-priority accounts — Ardrend (a direct competitor) exhibited robotic tank cleaning at the 10th edition',
                 'A concrete, time-sensitive opportunity to get in front of NLNG\'s Technical Division before a competitor closes the tank-inspection gap'],
      attendees:[{name:'NLNG', companyId:'nlng', status:'Host'}, {name:'Ardrend Limited (competitor)', companyId:'', status:'Exhibited in 2026'}],
      notes:'Exact 2027 date not yet confirmed — the 10th edition ran in 2026. Contact NLNG Vendor Management Services (vendorservices@nlng.com) for the official 11th-edition schedule.'},
  ];
  events.forEach(e=>{ e.attendees.forEach((a,i)=>{ a.id = e.id+'-a'+i; }); });

  const team = [
    {id:'u1', name:'', email:'', department:'MD', permission:'Admin'},
  ];
  const activityLog = [];
  const settings = {accessCode:'', connectors:[
    {id:'con1', name:'NIPEX Vendor Portal', type:'Procurement portal', url:'nipex-ng.com', notes:'Vendor pre-qualification and tender access for NNPC/JV-operated accounts.'},
    {id:'con2', name:'Aerosub company website', type:'Brand source', url:'aerosub.co', notes:'Source of the logo, colors and tagline used in exported reports.'},
    {id:'con3', name:'LinkedIn', type:'Contact research', url:'linkedin.com', notes:'Primary channel for verifying named contacts across all tracked accounts.'},
  ]};

  return {
    companies, tasks, solutions: SOLUTIONS.map(s=>({...s})), competitors, news, research,
    events, team, activityLog, settings, dismissedNewsIds: [],
    meta:{createdAt: iso(today)}
  };
}

/* ============================================================
   STORE
   HT4: the old localStorage `Store` (load/migrate/save) is gone — Supabase
   is DATA's source of truth now (src/store.js's loadAll(), called from
   enterApp() once a session + profile are confirmed). `seedData()` above
   stays only as the source scripts/gen-seed-source.mjs slices to regenerate
   supabase/seed.sql if the baseline data ever changes; it is not called at
   runtime and is dropped from the production bundle (dead-code elimination).
   ============================================================ */

/* ============================================================
   UI STATE
   ============================================================ */
const ui = {
  view:'dashboard',
  companyLayout:'board',
  companyFilter:{priority:'', stage:''},
  competitorFilter:{modality:'', threat:''},
  search:'',
  storeTab:'dashboard',    // 'dashboard' | 'products' | 'services' — Store sub-nav (V2 HT-B/C)
  storeShowArchived:false,
  storeShowSharedOnly:false,
  storeLayout:'cards',     // 'cards' | 'list' (V2 HT-C)
  storeSelected:new Set(),
  storeExpanded:new Set(), // list-view "expand for more info" (V2 HT-C)
  storeVisibleCount:50,    // pagination — "5 columns by 10 rows" (V2 HT-C)
  createTab:'quotes',      // 'quotes' | 'templates' — Create tab sub-nav (V2 HT-D)
  taskTab:'general',       // 'personal' | 'general' (V2 HT-F) — general by default so existing (pre-migration) tasks still show up
  companyTab:'general',    // same reasoning, for Companies
  drawerQuoteId:null,
  drawerRfqId:null,        // V2 HT-E
  drawerKind:null,        // 'company' | 'product' | 'service' | 'competitor' | 'event' | null
  drawerCompanyId:null,
  drawerProductId:null,
  drawerServiceId:null,
  drawerCompetitorId:null,
  drawerEventId:null,
  drawerScrollTop:0,
  tickerPaused:false,
  reportCompanyId:null,
  reportSections:{profile:true, pain:true, current:true, recommended:true, contacts:true, notes:false},
  alertsOpen:false,       // V2 HT-H — event-alert bell dropdown
};

/* ============================================================
   AUTH STATE  (PRD §5 — invite-link signup, no roles)
   ============================================================ */
const AUTH = {
  session: null,
  profile: null,          // profiles row, or null == not a member
  mode: 'loading',        // loading | signin | signup | reset | set-password
                          // | sent-confirm | sent-reset | no-profile | app
  inviteToken: null,
  pinnedEmail: '',
  error: '',
};

// Team data for the Settings view (profiles + invites), fetched on demand.
const SETTINGS = { profiles: [], invites: [], loaded: false, loading: false };

// Store sharing (V2 HT-C) — loaded lazily on first Store visit, same pattern
// as SETTINGS above. sharedWithMe drives the "Shared with me" filter.
const STORE_SHARES = { sharedWithMe: [], loaded: false, loading: false };
function loadStoreShares(){
  if (STORE_SHARES.loading || !AUTH.profile) return;
  STORE_SHARES.loading = true;
  storeSharesApi.listSharedWithMe(AUTH.profile.id)
    .then(rows=>{ STORE_SHARES.sharedWithMe = rows; STORE_SHARES.loaded = true; })
    .catch(()=>{})
    .finally(()=>{ STORE_SHARES.loading = false; if (ui.view==='solutions') renderView(); });
}
// Create tab data (V2 HT-D) — lazy-loaded on first visit, same pattern as
// SETTINGS/STORE_SHARES. Line items load per-quote, on demand (a quote list
// could grow; no need to pull every quote's items up front).
const CREATE_DATA = { templates: [], quotes: [], loaded: false, loading: false };
function loadCreateData(){
  if (CREATE_DATA.loading) return;
  CREATE_DATA.loading = true;
  Promise.all([quoteTemplatesApi.listAll(), quotesApi.listAll()])
    .then(([templates, quotes])=>{ CREATE_DATA.templates = templates; CREATE_DATA.quotes = quotes; CREATE_DATA.loaded = true; })
    .catch(()=>{ toast('Could not load templates/quotes'); })
    // Always renderApp(), not just renderView(): the "Upload template"/"New
    // quote" header buttons are gated on CREATE_DATA.loaded but live in
    // renderApp()'s own template, not renderCreate()'s — a renderView()-only
    // refresh would leave them permanently hidden on the Create view.
    .finally(()=>{ CREATE_DATA.loading = false; renderApp(); });
}
function reloadCreateData(){ CREATE_DATA.loaded = false; loadCreateData(); }

// The open quote's line items + its template's raw file text (for live
// preview) — loaded per-quote, on demand, mirroring ITEM_SHARE's pattern.
const QUOTE_EDITOR = { quoteId: null, lineItems: [], templateText: '', loaded: false, loading: false };
function loadQuoteEditor(quote){
  if (QUOTE_EDITOR.loading) return;
  QUOTE_EDITOR.loading = true;
  const tpl = quoteTemplateById(quote.templateId);
  Promise.all([
    quotesApi.listLineItems(quote.id),
    tpl ? downloadText(tpl.filePath).catch(()=>'') : Promise.resolve(''),
  ]).then(([lineItems, templateText])=>{
    QUOTE_EDITOR.quoteId = quote.id; QUOTE_EDITOR.lineItems = lineItems; QUOTE_EDITOR.templateText = templateText; QUOTE_EDITOR.loaded = true;
  }).catch(()=>{})
    .finally(()=>{ QUOTE_EDITOR.loading = false; if (ui.drawerQuoteId===quote.id) renderQuoteDrawer(); });
}

// RFQ Manager (V2 HT-E) — same lazy-load pattern as CREATE_DATA/QUOTE_EDITOR.
// Shared team-name lookup (V2 HT-E/F) — RFQ Manager, Plan and Companies all
// need "look up a teammate's display name by id"; a 3rd copy of the same
// listProfiles()-then-index logic would have been a real DRY violation.
const TEAM_ROSTER = { members: [], loaded: false, loading: false };
function loadTeamRoster(){
  if (TEAM_ROSTER.loading || TEAM_ROSTER.loaded) return;
  TEAM_ROSTER.loading = true;
  listProfiles()
    .then(members=>{ TEAM_ROSTER.members = members; TEAM_ROSTER.loaded = true; })
    .catch(()=>{})
    .finally(()=>{ TEAM_ROSTER.loading = false; renderApp(); });
}
function teammateName(id){ const t = TEAM_ROSTER.members.find(x=>x.id===id); return t ? (t.full_name||t.email) : ''; }

const RFQ_DATA = { rfqs: [], loaded: false, loading: false };
function loadRfqData(){
  if (RFQ_DATA.loading) return;
  RFQ_DATA.loading = true;
  // Also loads CREATE_DATA (templates/quotes) if it hasn't been already —
  // the RFQ drawer's "export as quote" / "linked quote" needs it, and
  // without this it'd be empty until the user happened to visit Create
  // first (a false "upload a template first" if templates actually exist).
  if (!CREATE_DATA.loaded) loadCreateData();
  if (!TEAM_ROSTER.loaded) loadTeamRoster();
  rfqsApi.listAll()
    .then(rfqs=>{ RFQ_DATA.rfqs = rfqs; RFQ_DATA.loaded = true; })
    .catch(()=>{ toast('Could not load RFQs'); })
    // Same reason as loadCreateData(): the "New RFQ" header button is gated
    // on RFQ_DATA.loaded and lives in renderApp()'s template, not
    // renderRfqs()'s — a renderView()-only refresh never shows it.
    .finally(()=>{ RFQ_DATA.loading = false; renderApp(); });
}
const RFQ_EDITOR = { rfqId: null, items: [], loaded: false, loading: false };
function loadRfqEditor(rfqId){
  if (RFQ_EDITOR.loading) return;
  RFQ_EDITOR.loading = true;
  rfqsApi.listItems(rfqId)
    .then(items=>{ RFQ_EDITOR.rfqId = rfqId; RFQ_EDITOR.items = items; RFQ_EDITOR.loaded = true; })
    .catch(()=>{})
    .finally(()=>{ RFQ_EDITOR.loading = false; if (ui.drawerRfqId===rfqId) renderRfqDrawer(); });
}

// Insights tab (V2 HT-G) — read-only aggregations. Reuses RFQ_DATA/DATA.tasks/
// TEAM_ROSTER (already loaded elsewhere) plus one real COUNT query for
// research (DATA.research is client-side paginated, would undercount).
const INSIGHTS_DATA = { total: 0, contributors: 0, loaded: false, loading: false };
function loadInsightsData(){
  if (INSIGHTS_DATA.loading) return;
  INSIGHTS_DATA.loading = true;
  if (!RFQ_DATA.loaded) loadRfqData();
  if (!TEAM_ROSTER.loaded) loadTeamRoster();
  insightsApi.researchTotals()
    .then(({total, contributors})=>{ INSIGHTS_DATA.total = total; INSIGHTS_DATA.contributors = contributors; INSIGHTS_DATA.loaded = true; })
    .catch(()=>{ toast('Could not load Insights'); })
    .finally(()=>{ INSIGHTS_DATA.loading = false; renderApp(); });
}

// The per-item Share section shown in the product/service drawers.
const ITEM_SHARE = { key: null, teammates: [], shares: [], loaded: false, loading: false };
function loadItemShares(kind, id){
  if (ITEM_SHARE.loading) return;
  ITEM_SHARE.loading = true;
  Promise.all([listProfiles(), storeSharesApi.listForItem(kind, id)])
    .then(([teammates, shares])=>{ ITEM_SHARE.key = `${kind}:${id}`; ITEM_SHARE.teammates = teammates; ITEM_SHARE.shares = shares; ITEM_SHARE.loaded = true; })
    .catch(()=>{})
    .finally(()=>{
      ITEM_SHARE.loading = false;
      if (kind==='product' && ui.drawerProductId===id) renderProductDrawer();
      if (kind==='service' && ui.drawerServiceId===id) renderServiceDrawer();
    });
}

// Research clips + the activity log are loaded newest-page-first (PRD §16
// S-2/S-12). The *End flags go true once a "Load older" page comes back
// short — hides the button. Both reset on boot + Refresh.
let researchEnd = false;
let activityEnd = false;

// Populated by enterApp() -> store.loadAll() once signed in with a profile.
// null while the auth screen or the post-sign-in loading state is showing.
let DATA = null;

function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove('show'), 2200);
}
function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso+'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}
function isOverdue(iso){
  if(!iso) return false;
  return new Date(iso+'T23:59:59') < new Date();
}
function daysUntil(iso){
  if(!iso) return null;
  const d = new Date(iso+'T00:00:00');
  return Math.round((d - new Date(new Date().toDateString()))/86400000);
}
// V2 HT-H — client-side event alerts (PRD-v2 §8): "events starting within
// N days", no Edge Function. 30 days gives enough lead time to actually act
// (travel/registration), unlike the dashboard's 7-day task reminder.
const EVENT_ALERT_WINDOW_DAYS = 30;
function upcomingAlertEvents(){
  return DATA.events
    .filter(e=>{ const d = daysUntil(e.startDate); return d !== null && d >= 0 && d <= EVENT_ALERT_WINDOW_DAYS; })
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));
}
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ============================================================
   THEME — light/dark toggle. The prototype already had CSS
   variables for both (:root = light, prefers-color-scheme: dark
   or [data-theme] override it) but no manual switch — it only
   followed the OS setting. This is a per-device display
   preference, so it lives in localStorage, not Supabase.
   ============================================================ */
const THEME_KEY = 'aerosub_theme';
function effectiveTheme(){
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function applyTheme(pref){
  if (pref === 'light' || pref === 'dark') document.documentElement.dataset.theme = pref;
  else delete document.documentElement.dataset.theme;
  const btn = document.getElementById('themeToggleBtn');
  if (btn){
    const isDark = effectiveTheme() === 'dark';
    btn.innerHTML = isDark ? ICONS.sun : ICONS.moon;
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
  }
}
function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
  applyTheme(saved || 'dark'); // no saved preference yet → default to dark, not the OS setting
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.addEventListener('click', ()=>{
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
    applyTheme(next);
  });
}

/* ============================================================
   PASSWORD FIELDS — a reveal/hide toggle on every password input
   (PRD had none; testers asked to see what they're typing).
   ============================================================ */
function pwField(label, id, opts = {}){
  const auto = opts.autocomplete || 'current-password';
  const ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : '';
  return `<div class="field">
    <label>${esc(label)}</label>
    <div class="pw-field">
      <input id="${id}" type="password" autocomplete="${auto}"${ph}>
      <button type="button" class="pw-toggle" data-pw-toggle="${id}" aria-label="Show password" title="Show password">${ICONS.eye}</button>
    </div>
  </div>`;
}
function bindPasswordToggles(root){
  (root || document).querySelectorAll('[data-pw-toggle]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const inp = document.getElementById(btn.dataset.pwToggle);
      if (!inp) return;
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
      btn.title = show ? 'Hide password' : 'Show password';
      btn.setAttribute('aria-label', btn.title);
    });
  });
}
function stripProto(url){
  let s = String(url==null?'':url).trim();
  if (s.indexOf('http://')===0) s = s.slice(7);
  else if (s.indexOf('https://')===0) s = s.slice(8);
  return s;
}
function companyById(id){ return DATA.companies.find(c=>c.id===id); }
function solutionById(id){ return DATA.solutions.find(s=>s.id===id); }
function serviceById(id){ return DATA.services.find(s=>s.id===id); }
function initials(name){
  return name.replace(/[^A-Za-z ]/g,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
}

/* ============================================================
   RENDER: SHELL
   ============================================================ */
function navCounts(){
  return {
    companies: DATA.companies.length,
    contacts: DATA.companies.reduce((a,c)=>a+c.contacts.length,0),
    tasks: DATA.tasks.filter(t=>!t.done).length,
    products: DATA.solutions.length + DATA.services.length,
    competitors: DATA.competitors.length,
    research: DATA.research.length,
    events: DATA.events.length,
    quotes: CREATE_DATA.loaded ? CREATE_DATA.quotes.length : undefined,
    rfqs: RFQ_DATA.loaded ? RFQ_DATA.rfqs.length : undefined,
  };
}

function renderApp(){
  const n = navCounts();
  const NAV = [
    {id:'dashboard', label:'Dashboard', icon:ICONS.dash},
    {id:'companies', label:'Companies', icon:ICONS.building, count:n.companies},
    {id:'contacts', label:'Contacts', icon:ICONS.users, count:n.contacts},
    {id:'competitors', label:'Competition', icon:ICONS.radar, count:n.competitors},
    {id:'events', label:'Events', icon:ICONS.calendar, count:n.events},
    {id:'research', label:'Research', icon:ICONS.clip, count:n.research},
    {id:'tasks', label:'Plan', icon:ICONS.task, count:n.tasks},
    {id:'solutions', label:'Store', icon:ICONS.bolt, count:n.products},
    {id:'create', label:'Create', icon:ICONS.docPlus, count:n.quotes},
    {id:'rfqs', label:'RFQ Manager', icon:ICONS.outbox, count:n.rfqs},
    {id:'insights', label:'Insights', icon:ICONS.barChart},
    {id:'reports', label:'Reports', icon:ICONS.doc},
    {id:'settings', label:'Settings', icon:ICONS.shield},
  ];
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="sidebar">
      <div class="brand">
        <div class="mark">AEROSUB</div>
        <div class="sub">Business Development Pipeline</div>
      </div>
      <div class="nav">
        ${NAV.map(item=>`
          <button class="nav-item ${ui.view===item.id?'active':''}" data-nav="${item.id}">
            <span class="ico">${item.icon}</span>
            <span>${item.label}</span>
            ${item.count!==undefined?`<span class="nav-count tabular">${item.count}</span>`:''}
          </button>
        `).join('')}
      </div>
      <div class="sidebar-foot">
        <button class="io-btn" id="exportBtn">${ICONS.download} Export data (.json)</button>
        <div class="storage-note">Export is a manual backup snapshot of what's loaded right now.</div>
        <div class="who-row">
          <span class="who-name">${esc(currentUserName())}</span>
          <button class="linklike" id="signOutBtn">Sign out</button>
        </div>
      </div>
    </div>
    <div class="main">
      <div class="topbar">
        <div>
          <div class="crumb">${viewCrumb()}</div>
          <h1>${viewTitle()}</h1>
        </div>
        ${renderAlertBell()}
        <button class="btn btn-ghost" id="refreshAllBtn" title="Re-pull everything from the server (PRD §9 — no realtime, refetch on demand)">${ICONS.refresh||'↻'} Refresh</button>
        ${['companies','contacts','solutions','competitors','research','events'].includes(ui.view) && !(ui.view==='solutions' && ui.storeTab==='dashboard') ? `
        <div class="search-wrap">
          ${ICONS.search}
          <input id="searchInput" placeholder="Search ${ui.view==='solutions'?ui.storeTab:ui.view}…" value="${esc(ui.search)}">
        </div>` : '<div style="margin-left:auto"></div>'}
        ${ui.view==='companies' ? `<button class="btn btn-primary" id="addCompanyBtn">${ICONS.plus} Account</button>`:''}
        ${ui.view==='contacts' ? `<button class="btn btn-primary" id="addContactBtn">${ICONS.plus} Contact</button>`:''}
        ${ui.view==='tasks' ? `<button class="btn btn-primary" id="addTaskBtn">${ICONS.plus} Task</button>`:''}
        ${ui.view==='solutions' && ui.storeTab!=='dashboard' ? `<button class="btn btn-ghost" id="bulkUploadStoreBtn">${ICONS.upload} Bulk upload</button><button class="btn btn-primary" id="addSolutionBtn">${ICONS.plus} ${ui.storeTab==='services'?'Service':'Product'}</button>`:''}
        ${ui.view==='competitors' ? `<button class="btn btn-primary" id="addCompetitorBtn">${ICONS.plus} Competitor</button>`:''}
        ${ui.view==='events' ? `<button class="btn btn-primary" id="addEventBtn">${ICONS.plus} Event</button>`:''}
        ${ui.view==='research' ? `<button class="btn btn-ghost" id="importResearchBtn">${ICONS.upload} Import clips</button><input type="file" id="importResearchFile" accept="application/json" style="display:none"><button class="btn btn-primary" id="addResearchBtn">${ICONS.plus} Clip</button>`:''}
        ${ui.view==='create' && CREATE_DATA.loaded ? (ui.createTab==='templates'
          ? `<button class="btn btn-primary" id="uploadTemplateBtn">${ICONS.upload} Upload template</button>`
          : `<button class="btn btn-primary" id="addQuoteBtn">${ICONS.plus} New quote</button>`) : ''}
        ${ui.view==='rfqs' && RFQ_DATA.loaded ? `<button class="btn btn-primary" id="addRfqBtn">${ICONS.plus} New RFQ</button>`:''}
      </div>
      <div class="view" id="viewMount"></div>
    </div>
  `;
  bindShell();
  renderView();
}

function viewTitle(){
  return ({dashboard:'Overview', companies:'Companies', contacts:'Contacts', tasks:'Plan', solutions:'Store', create:'Create', rfqs:'RFQ Manager', insights:'Insights', competitors:'Competition Dashboard', research:'Research', reports:'Report Builder', events:'Events', settings:'Settings'})[ui.view];
}
function viewCrumb(){
  return ({dashboard:'Pipeline / Overview', companies:'Pipeline / Accounts', contacts:'Pipeline / People', tasks:'Pipeline / Actions', solutions:'Pipeline / Catalog', create:'Pipeline / Quotes', rfqs:'Pipeline / RFQs', insights:'Pipeline / Insights', competitors:'Pipeline / Market Watch', research:'Pipeline / Clips', reports:'Pipeline / Export', events:'Pipeline / Events', settings:'Pipeline / Admin'})[ui.view];
}

// V2 HT-H — the event-alert bell (PRD-v2 §8). Opted out entirely (no bell
// shown) when the viewer has disabled it in Settings; the checkbox itself
// gates the whole feature, not just the badge count.
function renderAlertBell(){
  const me = AUTH.profile;
  if (!me || me.event_alerts_enabled === false) return '';
  const upcoming = upcomingAlertEvents();
  return `
    <div class="alert-bell">
      <button class="btn btn-ghost" id="alertBellBtn" title="Events starting within ${EVENT_ALERT_WINDOW_DAYS} days">
        ${ICONS.bell}${upcoming.length ? `<span class="alert-badge">${upcoming.length}</span>` : ''}
      </button>
      ${ui.alertsOpen ? `
      <div class="alert-panel">
        <div class="row" style="justify-content:space-between;margin-bottom:8px;">
          <b style="font-size:12.5px;">Events in the next ${EVENT_ALERT_WINDOW_DAYS} days</b>
          <button class="x" id="alertPanelClose">${ICONS.x}</button>
        </div>
        ${upcoming.length===0 ? `<div class="empty" style="padding:10px;">${ICONS.empty}<div>Nothing coming up.</div></div>` :
          upcoming.map(e=>`
            <div class="needs-row" data-nav="events">
              <span class="t">${esc(e.name)}</span>
              <span class="d">${fmtDate(e.startDate)}</span>
            </div>
          `).join('')}
      </div>` : ''}
    </div>
  `;
}

function bindShell(){
  document.querySelectorAll('[data-nav]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const view = btn.dataset.nav;
      ui.view = view; ui.search = ''; ui.alertsOpen = false;
      ui.storeSelected.clear(); ui.storeExpanded.clear();
      renderApp();
      refreshCurrentView(view);   // PRD §9: refetch that view's slice on navigate
    });
  });
  const alertBellBtn = document.getElementById('alertBellBtn');
  if (alertBellBtn) alertBellBtn.addEventListener('click', ()=>{ ui.alertsOpen = !ui.alertsOpen; renderApp(); });
  const alertPanelClose = document.getElementById('alertPanelClose');
  if (alertPanelClose) alertPanelClose.addEventListener('click', ()=>{ ui.alertsOpen = false; renderApp(); });
  const refreshAllBtn = document.getElementById('refreshAllBtn');
  if (refreshAllBtn) refreshAllBtn.addEventListener('click', doRefreshAll);
  const search = document.getElementById('searchInput');
  if (search){
    search.addEventListener('input', e=>{ ui.search = e.target.value; renderView(); });
  }
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) signOutBtn.addEventListener('click', async ()=>{
    signOutBtn.disabled = true;
    await signOut();   // onAuthChange('SIGNED_OUT') swaps to the auth screen
  });
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.addEventListener('click', doExport);

  const addCompanyBtn = document.getElementById('addCompanyBtn');
  if (addCompanyBtn) addCompanyBtn.addEventListener('click', openAddCompanyModal);
  const addContactBtn = document.getElementById('addContactBtn');
  if (addContactBtn) addContactBtn.addEventListener('click', ()=>openAddContactModal(null));
  const addTaskBtn = document.getElementById('addTaskBtn');
  if (addTaskBtn) addTaskBtn.addEventListener('click', ()=>openAddTaskModal(null));
  const addSolutionBtn = document.getElementById('addSolutionBtn');
  if (addSolutionBtn) addSolutionBtn.addEventListener('click', ()=> ui.storeTab==='services' ? openAddServiceModal() : openAddSolutionModal());
  const bulkUploadStoreBtn = document.getElementById('bulkUploadStoreBtn');
  if (bulkUploadStoreBtn) bulkUploadStoreBtn.addEventListener('click', ()=>openBulkUploadModal(ui.storeTab==='services'?'service':'product'));
  const addCompetitorBtn = document.getElementById('addCompetitorBtn');
  if (addCompetitorBtn) addCompetitorBtn.addEventListener('click', openAddCompetitorModal);
  const addResearchBtn = document.getElementById('addResearchBtn');
  if (addResearchBtn) addResearchBtn.addEventListener('click', ()=>openAddResearchModal());
  const importResearchBtn = document.getElementById('importResearchBtn');
  const importResearchFile = document.getElementById('importResearchFile');
  if (importResearchBtn) importResearchBtn.addEventListener('click', ()=>{
    if (importResearchFile) importResearchFile.click();
  });
  if (importResearchFile) importResearchFile.addEventListener('change', doImportResearch);
  const addEventBtn = document.getElementById('addEventBtn');
  if (addEventBtn) addEventBtn.addEventListener('click', openAddEventModal);
}

// Re-pulls one view's Supabase-backed slice after navigating to it (PRD §9).
// A no-op for views not yet wired to Supabase (store.refetchView returns
// null for those) — their data stays whatever's already in memory.
async function refreshCurrentView(view){
  if (!DATA) return;
  try{
    const patch = await store.refetchView(view);
    if (!patch || !DATA) return;
    for (const k of ['companies', 'news', 'competitors', 'tasks', 'solutions', 'services', 'events']){
      if (patch[k]) DATA[k] = patch[k];
    }
    if (ui.view === view) renderApp();   // only re-render if still on that view
  }catch(e){ /* silent — the header Refresh button is the explicit retry path */ }
}

// The header "Refresh" control — re-pulls every table (PRD §9).
async function doRefreshAll(){
  const btn = document.getElementById('refreshAllBtn');
  if (btn) btn.disabled = true;
  try{
    if (!(await guardMembership())) return;   // bounced to no-profile screen
    DATA = await store.loadAll();
    researchEnd = false; activityEnd = false;
    renderApp();
    toast('Refreshed');
  }catch(e){
    toast('Could not refresh — ' + (e.message || 'try again'));
    if (btn) btn.disabled = false;
  }
}

function renderView(){
  const mount = document.getElementById('viewMount');
  if (!mount) return;
  if (ui.view==='dashboard') mount.innerHTML = renderDashboard();
  else if (ui.view==='companies') mount.innerHTML = renderCompanies();
  else if (ui.view==='contacts') mount.innerHTML = renderContacts();
  else if (ui.view==='tasks') mount.innerHTML = renderTasks();
  else if (ui.view==='solutions') mount.innerHTML = renderSolutions();
  else if (ui.view==='create') mount.innerHTML = renderCreate();
  else if (ui.view==='rfqs') mount.innerHTML = renderRfqs();
  else if (ui.view==='insights') mount.innerHTML = renderInsights();
  else if (ui.view==='competitors') mount.innerHTML = renderCompetitors();
  else if (ui.view==='research') mount.innerHTML = renderResearch();
  else if (ui.view==='reports') mount.innerHTML = renderReports();
  else if (ui.view==='events') mount.innerHTML = renderEvents();
  else if (ui.view==='settings') mount.innerHTML = renderSettings();
  bindView();
  if (ui.view==='dashboard') startTicker();
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard(){
  const total = DATA.companies.length;
  const byStage = STAGES.map(s=>({...s, count: DATA.companies.filter(c=>c.stage===s.id).length}));
  const contactsCount = DATA.companies.reduce((a,c)=>a+c.contacts.length,0);
  const verifiedCount = DATA.companies.reduce((a,c)=>a+c.contacts.filter(x=>x.verified).length,0);
  const openTasks = DATA.tasks.filter(t=>!t.done);
  const overdue = openTasks.filter(t=>isOverdue(t.due));
  const dueSoon = openTasks.filter(t=>!isOverdue(t.due) && daysUntil(t.due)<=7).sort((a,b)=>a.due.localeCompare(b.due));
  const flagged = DATA.companies.filter(c=>c.flags && c.flags.length);
  const highPriorityOpen = DATA.companies.filter(c=>c.priority==='high' && c.stage!=='won' && c.stage!=='hold');

  const PAIN_RULES = [
    [/no .*(drone|rov|robot|uav|crawler|digital[- ]twin)/i, 'No robotic/digital inspection in place'],
    [/receivership|litigation|court|legal|signing authority/i, 'Legal / counterparty risk'],
    [/theft|sabotage|vandal|spill/i, 'Security, theft & spill exposure'],
    [/confined[- ]space|asphyxiation|hazard|swamp|creek|terrain|mangrove|foot\/boat|difficult to (reach|access)/i, 'Access, terrain & confined-space risk'],
    [/aging|1970|life[- ]extension|life extension|~?\d{2}\s*years? old|since (19|200)\d|onstream/i, 'Aging / legacy infrastructure'],
    [/no (named|dedicated).*(contact|manager|title)/i, 'No named integrity contact'],
    [/no (public|confirmed|current).*(source|record|provider|methodology|documentation|contractor)/i, 'Undisclosed inspection methodology'],
  ];
  const painTally = {};
  DATA.companies.forEach(c=>c.painPoints.forEach(p=>{
    const hit = PAIN_RULES.find(([re])=>re.test(p));
    const key = hit ? hit[1] : 'Other operational gap';
    painTally[key] = (painTally[key]||0)+1;
  }));
  const painEntries = Object.entries(painTally).sort((a,b)=>b[1]-a[1]);
  const painMax = Math.max(...painEntries.map(e=>e[1]),1);

  return `
    ${renderTicker()}
    <div class="grid-tiles">
      <div class="card tile"><div class="n tabular">${total}</div><div class="l">Accounts tracked</div></div>
      <div class="card tile"><div class="n tabular">${contactsCount}</div><div class="l">Contacts on file (${verifiedCount} LinkedIn-verified)</div></div>
      <div class="card tile"><div class="n tabular">${openTasks.length}</div><div class="l">Open actions</div></div>
      <div class="card tile"><div class="n tabular" style="color:${overdue.length?'var(--critical)':'var(--ink)'}">${overdue.length}</div><div class="l">Overdue</div></div>
      <div class="card tile"><div class="n tabular">${highPriorityOpen.length}</div><div class="l">High-priority live accounts</div></div>
      <div class="card tile"><div class="n tabular" style="color:${flagged.length?'var(--gold)':'var(--ink)'}">${flagged.length}</div><div class="l">Flagged accounts</div></div>
    </div>

    <div class="dash-grid">
      <div>
        <div class="card panel">
          <h3>Needs attention</h3>
          ${flagged.length===0 && overdue.length===0 ? `<div class="empty">${ICONS.empty}<div>Nothing urgent right now.</div></div>` : ''}
          ${flagged.map(c=>`
            <div class="needs-row" data-open-company="${c.id}">
              <span class="chip ${c.flags[0].type==='critical'?'chip-high':'chip-gold'}">${c.flags[0].type==='critical'?ICONS.warn:ICONS.star}</span>
              <span class="t"><b>${esc(c.name)}</b> — ${esc(c.flags[0].text)}</span>
            </div>
          `).join('')}
          ${overdue.map(t=>`
            <div class="needs-row" data-open-company="${t.companyId||''}">
              <span class="chip chip-high">${ICONS.warn}</span>
              <span class="t">${esc(t.title)}</span>
              <span class="d">Due ${fmtDate(t.due)}</span>
            </div>
          `).join('')}
        </div>

        <div class="card panel">
          <h3>Upcoming actions (7 days)</h3>
          ${dueSoon.length===0 ? `<div class="empty">${ICONS.empty}<div>Nothing due this week.</div></div>` :
            dueSoon.map(t=>`
              <div class="needs-row" data-open-company="${t.companyId||''}">
                <span>${companyChip(t.companyId)}</span>
                <span class="t">${esc(t.title)}</span>
                <span class="d">${fmtDate(t.due)}</span>
              </div>
            `).join('')}
        </div>
      </div>

      <div>
        <div class="card panel">
          <h3>Pipeline by stage</h3>
          <div class="stagebar">
            ${byStage.map(s=>`<span style="width:${total? (s.count/total*100):0}%; background:${s.dot}"></span>`).join('')}
          </div>
          <div class="stage-legend">
            ${byStage.filter(s=>s.count>0).map(s=>`<div><i style="background:${s.dot}"></i>${s.label} · ${s.count}</div>`).join('')}
          </div>
        </div>

        <div class="card panel">
          <h3>Recurring pain-point themes</h3>
          ${painEntries.map(([k,v])=>`
            <div class="theme-bar-row">
              <div class="lbl">${esc(k)}</div>
              <div class="track"><div class="fill" style="width:${v/painMax*100}%"></div></div>
              <div class="val tabular">${v}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}
function companyChip(id){
  if(!id) return '<span class="chip chip-low">General</span>';
  const c = companyById(id);
  if(!c) return '';
  return `<span class="chip chip-teal">${esc(c.name)}</span>`;
}

/* ============================================================
   NEWS TICKER — news_items in Postgres (src/api/news.js). `live` marks a
   row a future automated feed job would add (PRD §12 V2 roadmap); every
   item here is currently added by hand via the Manage modal. Dismissing an
   item sets dismissed_at team-wide (D-5) instead of a per-browser id list.
   ============================================================ */
function newsRefLabel(item){
  if (item.kind==='company'){ const c = companyById(item.refId); return c ? c.name : null; }
  if (item.kind==='product'){ const p = solutionById(item.refId); return p ? p.name : null; }
  return null;
}
function renderTicker(){
  const items = [...DATA.news].sort((a,b)=>b.date.localeCompare(a.date));
  const refreshedAt = DATA.settings && DATA.settings.lastNewsRefresh;
  const refreshBadge = refreshedAt ? `<div class="ticker-refreshed"><span class="dot"></span>Live feed updated ${fmtDate(refreshedAt.slice(0,10))}</div>` : '';
  if (items.length===0){
    return `
    <div class="ticker-shell">
      <div class="ticker-label">${ICONS.scroll} News</div>
      <div style="flex:1;padding:0 14px;font-size:11.5px;color:#9db4ba;">No news items yet — add one to start the feed.</div>
      ${refreshBadge}
      <button class="ticker-manage" id="manageNewsBtn">+ Add</button>
    </div>`;
  }
  const itemHtml = items.map(n=>{
    const tag = newsRefLabel(n);
    const href = n.url ? `https://${stripProto(n.url)}` : '#';
    return `<a class="ticker-item" href="${esc(href)}" target="_blank" rel="noopener">
      ${n.live?`<span class="ti-live"><span class="dot"></span>Live</span>`:''}
      ${tag?`<span class="ti-tag">${esc(tag)}</span>`:''}
      <span class="ti-title">${esc(n.title)}</span>
      <span class="ti-date">${fmtDate(n.date)} · ${esc(n.source)}</span>
    </a>`;
  }).join('');
  return `
    <div class="ticker-shell">
      <div class="ticker-label">${ICONS.scroll} News</div>
      <div class="ticker-wrap" id="tickerWrap">
        <div class="ticker-track" id="tickerTrack">${itemHtml}${itemHtml}</div>
      </div>
      ${refreshBadge}
      <button class="ticker-manage" id="manageNewsBtn">Manage</button>
    </div>
  `;
}
function startTicker(){
  const btn = document.getElementById('manageNewsBtn');
  if (btn) btn.addEventListener('click', openManageNewsModal);
}
function openManageNewsModal(){
  const companyOptions = DATA.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const productOptions = DATA.solutions.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const items = [...DATA.news].sort((a,b)=>b.date.localeCompare(a.date));
  openModal(`
    <h3>News feed</h3>
    <p style="font-size:11.5px;color:var(--muted);line-height:1.5;margin-bottom:12px;">
      Add items by hand as you spot them (news, LinkedIn posts, press releases). A "Live" tag marks anything a future automated feed job would add — no such job runs yet${(DATA.settings&&DATA.settings.lastNewsRefresh)?` (last refreshed ${fmtDate(DATA.settings.lastNewsRefresh.slice(0,10))})`:''}. Removing an item here removes it for everyone.
    </p>
    <div class="field"><label>Headline</label><input id="mTitle"></div>
    <div class="field"><label>Source</label><input id="mSource" placeholder="e.g. Upstream Online, LinkedIn, company press release"></div>
    <div class="field"><label>Link</label><input id="mUrl" placeholder="example.com/article"></div>
    <div class="field"><label>Date</label><input type="date" id="mDate" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>Relates to</label>
      <select id="mKind">
        <option value="company">A company we're following</option>
        <option value="product">One of our products/offers</option>
        <option value="">General / other</option>
      </select>
    </div>
    <div class="field" id="mRefWrap"><label>Which one</label><select id="mRef">${companyOptions}</select></div>
    <div class="modal-actions"><button class="btn btn-primary" id="mAdd" style="width:100%;justify-content:center;">${ICONS.plus} Add to feed</button></div>
    <hr>
    <div style="max-height:280px;overflow-y:auto;">
      ${items.length===0?`<div class="empty" style="padding:10px;">${ICONS.empty}<div>Nothing in the feed yet.</div></div>`:
        items.map(n=>`
        <div class="news-row">
          <div class="info">
            <div class="t">${n.live?`<span class="ti-live" style="margin-right:6px;">Live</span>`:''}${esc(n.title)}</div>
            <div class="m">${fmtDate(n.date)} · ${esc(n.source)} ${newsRefLabel(n)?'· '+esc(newsRefLabel(n)):''}</div>
          </div>
          <button class="x" data-del-news="${n.id}" style="background:none;border:none;color:var(--faint);cursor:pointer;">${ICONS.x}</button>
        </div>
      `).join('')}
    </div>
  `, body=>{
    const kindSel = body.querySelector('#mKind');
    const refWrap = body.querySelector('#mRefWrap');
    const refSel = body.querySelector('#mRef');
    function syncRefOptions(){
      if (kindSel.value==='company'){ refWrap.style.display=''; refSel.innerHTML = companyOptions; }
      else if (kindSel.value==='product'){ refWrap.style.display=''; refSel.innerHTML = productOptions; }
      else { refWrap.style.display='none'; }
    }
    kindSel.addEventListener('change', syncRefOptions);
    syncRefOptions();

    body.querySelector('#mAdd').addEventListener('click', async ()=>{
      const title = body.querySelector('#mTitle').value.trim();
      if (!title){ toast('Headline required'); return; }
      const addBtn = body.querySelector('#mAdd'); addBtn.disabled = true;
      const news = {
        title, source: body.querySelector('#mSource').value.trim()||'Unknown source',
        url: body.querySelector('#mUrl').value.trim(), date: body.querySelector('#mDate').value || new Date().toISOString().slice(0,10),
        kind: kindSel.value, refId: kindSel.value ? refSel.value : '',
      };
      try{
        const saved = await newsApi.create(news);
        DATA.news.push(saved);
        closeModal(); renderView(); toast('Added to feed');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); addBtn.disabled = false; }
    });
    body.querySelectorAll('[data-del-news]').forEach(b=>b.addEventListener('click', async ()=>{
      const id = b.dataset.delNews;
      b.disabled = true;
      try{
        await newsApi.dismiss(id, AUTH.profile && AUTH.profile.id);
        DATA.news = DATA.news.filter(x=>x.id!==id);
        closeModal(); renderView(); openManageNewsModal();
      }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); b.disabled = false; }
    }));
  });
}

/* ============================================================
   COMPANIES
   ============================================================ */
// V2 HT-F — same "assigned to you shows in both tabs" rule as taskTabItems().
function filteredCompanies(){
  const q = ui.search.trim().toLowerCase();
  const me = AUTH.profile?.id;
  return DATA.companies.filter(c=>{
    if (ui.companyTab==='general' ? c.visibility!=='general' : !(c.ownerId===me || c.assignedTo===me)) return false;
    if (ui.companyFilter.priority && c.priority!==ui.companyFilter.priority) return false;
    if (ui.companyFilter.stage && c.stage!==ui.companyFilter.stage) return false;
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q);
  });
}

function renderCompanies(){
  if (!TEAM_ROSTER.loaded) loadTeamRoster();
  const list = filteredCompanies();
  return `
    <div class="toolbar">
      <div class="seg">
        <button data-company-tab="personal" class="${ui.companyTab==='personal'?'active':''}">Personal</button>
        <button data-company-tab="general" class="${ui.companyTab==='general'?'active':''}">General</button>
      </div>
      <div class="seg" style="margin-left:12px;">
        <button data-layout="board" class="${ui.companyLayout==='board'?'active':''}">Board</button>
        <button data-layout="table" class="${ui.companyLayout==='table'?'active':''}">Table</button>
      </div>
      <select class="select" id="filterPriority">
        <option value="">All priorities</option>
        ${PRIORITIES.map(p=>`<option value="${p}" ${ui.companyFilter.priority===p?'selected':''}>${p[0].toUpperCase()+p.slice(1)} priority</option>`).join('')}
      </select>
      <select class="select" id="filterStage">
        <option value="">All stages</option>
        ${STAGES.map(s=>`<option value="${s.id}" ${ui.companyFilter.stage===s.id?'selected':''}>${s.label}</option>`).join('')}
      </select>
      <span style="margin-left:auto;font-size:11.5px;color:var(--muted)">${list.length} of ${DATA.companies.length} accounts</span>
    </div>
    ${ui.companyLayout==='board' ? renderBoard(list) : renderCompanyTable(list)}
  `;
}

function renderBoard(list){
  return `<div class="board">
    ${STAGES.map(stage=>{
      const items = list.filter(c=>c.stage===stage.id);
      return `
      <div class="col" data-stage="${stage.id}">
        <div class="col-head"><span class="dot" style="background:${stage.dot}"></span><span class="name">${stage.label}</span><span class="count tabular">${items.length}</span></div>
        ${items.map(c=>renderKCard(c)).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function renderKCard(c){
  const nextTask = DATA.tasks.filter(t=>t.companyId===c.id && !t.done).sort((a,b)=>a.due.localeCompare(b.due))[0];
  return `
    <div class="kcard" draggable="true" data-company="${c.id}">
      <div class="row" style="justify-content:space-between;">
        <div class="name">${esc(c.name)}</div>
      </div>
      <div class="type">${esc(c.type)}</div>
      <div class="metarow">
        <span class="chip chip-${c.priority}"><span class="chip-dot"></span>${c.priority}</span>
        ${c.flags && c.flags.length ? `<span class="chip ${c.flags[0].type==='critical'?'chip-high':'chip-gold'}">${c.flags[0].type==='critical'?ICONS.warn:ICONS.star}</span>` : ''}
        ${c.visibility==='personal' ? `<span class="chip chip-low" style="font-size:9px;">Personal</span>` : ''}
      </div>
      <div class="stats">
        <span>${ICONS.warn} ${c.painPoints.length} gaps</span>
        <span>${ICONS.bolt} ${c.recommended.length} fits</span>
        <span>${ICONS.users} ${c.contacts.length}</span>
      </div>
      ${nextTask ? `<div class="stats" style="color:${isOverdue(nextTask.due)?'var(--critical)':'var(--muted)'}">${ICONS.task} ${esc(nextTask.title)}</div>` : ''}
    </div>
  `;
}

function renderCompanyTable(list){
  if (!list.length) return `<div class="empty">${ICONS.empty}<div>No accounts match.</div></div>`;
  return `
  <div class="card tablewrap">
    <table>
      <thead><tr><th>Account</th><th>Type</th><th>Stage</th><th>Priority</th><th>Gaps</th><th>Contacts</th><th>Flag</th></tr></thead>
      <tbody>
        ${list.map(c=>`
          <tr data-open-company="${c.id}">
            <td class="name-cell">${esc(c.name)}${c.visibility==='personal'?` <span class="chip chip-low" style="font-size:9px;">Personal</span>`:''}</td>
            <td>${esc(c.type)}</td>
            <td><span class="chip chip-teal">${stageOf(c.stage).label}</span></td>
            <td><span class="chip chip-${c.priority}"><span class="chip-dot"></span>${c.priority}</span></td>
            <td class="tabular">${c.painPoints.length}</td>
            <td class="tabular">${c.contacts.length}</td>
            <td>${c.flags && c.flags.length ? `<span class="chip ${c.flags[0].type==='critical'?'chip-high':'chip-gold'}">${c.flags[0].type==='critical'?'RISK':'LINKED'}</span>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
}

function bindCompaniesControls(){
  document.querySelectorAll('[data-company-tab]').forEach(b=>b.addEventListener('click', ()=>{ ui.companyTab=b.dataset.companyTab; renderView(); }));
  document.querySelectorAll('[data-layout]').forEach(b=>b.addEventListener('click', ()=>{ ui.companyLayout=b.dataset.layout; renderView(); }));
  const fp = document.getElementById('filterPriority');
  if (fp) fp.addEventListener('change', e=>{ ui.companyFilter.priority=e.target.value; renderView(); });
  const fs = document.getElementById('filterStage');
  if (fs) fs.addEventListener('change', e=>{ ui.companyFilter.stage=e.target.value; renderView(); });

  document.querySelectorAll('[data-open-company]').forEach(el=>{
    el.addEventListener('click', ()=>{ const id=el.dataset.openCompany; if(id) openDrawer(id); });
  });

  // drag & drop
  document.querySelectorAll('.kcard').forEach(card=>{
    card.addEventListener('dragstart', e=>{
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.company);
    });
    card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
    card.addEventListener('click', (e)=>{ if(!card.classList.contains('dragging')) openDrawer(card.dataset.company); });
  });
  document.querySelectorAll('.col').forEach(col=>{
    col.addEventListener('dragover', e=>{ e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', ()=>col.classList.remove('dragover'));
    col.addEventListener('drop', e=>{
      e.preventDefault(); col.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const c = companyById(id);
      if (c) setCompanyStage(c, col.dataset.stage);
    });
  });
}

// Shared by the kanban drag-drop and the drawer's stage dropdown. Writes
// company_stage_changes automatically via the companies AFTER UPDATE trigger
// (PRD §6.5) — no client-side history write needed.
async function setCompanyStage(c, stage, { inDrawer } = {}){
  if (c.stage === stage) return;
  try{
    await companiesApi.setStage(c.id, stage);
    c.stage = stage;
    logActivity('Moved pipeline stage', `${c.name} → ${stageOf(stage).label}`);
    toast(`${c.name} moved to ${stageOf(stage).label}`);
  }catch(e){
    toast('Could not move — ' + (e.message || 'try again'));
  }
  renderApp();
  if (inDrawer) openDrawer(c.id);
}
async function setCompanyPriority(c, priority){
  if (c.priority === priority) return;
  try{
    await companiesApi.setPriority(c.id, priority);
    c.priority = priority;
  }catch(e){
    toast('Could not save priority — ' + (e.message || 'try again'));
  }
  renderApp(); openDrawer(c.id);
}

/* ============================================================
   DRAWER (Company detail)
   ============================================================ */
function openDrawer(id){
  ui.drawerKind = 'company';
  ui.drawerCompanyId = id;
  ui.drawerProductId = null;
  document.getElementById('scrim').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  document.getElementById('scrim').onclick = closeDrawer;
  renderDrawer();
}
function openProductDrawer(id){
  ui.drawerKind = 'product';
  ui.drawerProductId = id;
  ui.drawerCompanyId = null; ui.drawerServiceId = null;
  document.getElementById('scrim').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  document.getElementById('scrim').onclick = closeDrawer;
  renderProductDrawer();
}
function openServiceDrawer(id){
  ui.drawerKind = 'service';
  ui.drawerServiceId = id;
  ui.drawerCompanyId = null; ui.drawerProductId = null;
  document.getElementById('scrim').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  document.getElementById('scrim').onclick = closeDrawer;
  renderServiceDrawer();
}
function openCompetitorDrawer(id){
  ui.drawerKind = 'competitor';
  ui.drawerCompetitorId = id;
  ui.drawerCompanyId = null;
  ui.drawerProductId = null;
  document.getElementById('scrim').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  document.getElementById('scrim').onclick = closeDrawer;
  renderCompetitorDrawer();
}
function openQuoteDrawer(id){
  ui.drawerKind = 'quote';
  ui.drawerQuoteId = id;
  ui.drawerCompanyId = null; ui.drawerProductId = null; ui.drawerServiceId = null; ui.drawerCompetitorId = null;
  document.getElementById('scrim').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  document.getElementById('scrim').onclick = closeDrawer;
  QUOTE_EDITOR.loaded = false;
  renderQuoteDrawer();
}
function openRfqDrawer(id){
  ui.drawerKind = 'rfq';
  ui.drawerRfqId = id;
  ui.drawerCompanyId = null; ui.drawerProductId = null; ui.drawerServiceId = null; ui.drawerCompetitorId = null; ui.drawerQuoteId = null;
  document.getElementById('scrim').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  document.getElementById('scrim').onclick = closeDrawer;
  RFQ_EDITOR.loaded = false;
  renderRfqDrawer();
}
function closeDrawer(){
  document.getElementById('scrim').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
  ui.drawerKind = null;
  ui.drawerCompanyId = null;
  ui.drawerProductId = null;
  ui.drawerServiceId = null;
  ui.drawerCompetitorId = null;
  ui.drawerEventId = null;
  ui.drawerQuoteId = null;
  ui.drawerRfqId = null;
}
function renderDrawer(){
  const c = companyById(ui.drawerCompanyId);
  const drawer = document.getElementById('drawer');
  if (!c){ drawer.innerHTML=''; return; }
  const tasks = DATA.tasks.filter(t=>t.companyId===c.id).sort((a,b)=>(a.done-b.done)|| a.due.localeCompare(b.due));

  drawer.innerHTML = `
    <button class="drawer-close" id="drawerCloseBtn">${ICONS.x}</button>
    <div class="drawer-head">
      <div class="eyebrow">${esc(c.type)}</div>
      <h2>${esc(c.name)}</h2>
      <div class="field-row">
        <select id="stageSelect">${STAGES.map(s=>`<option value="${s.id}" ${c.stage===s.id?'selected':''}>${s.label}</option>`).join('')}</select>
        <select id="prioritySelect">${PRIORITIES.map(p=>`<option value="${p}" ${c.priority===p?'selected':''}>${p[0].toUpperCase()+p.slice(1)} priority</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="deleteCompanyBtn" style="color:#f3d9d6;border:1px solid var(--navy-line);">Remove account</button>
      </div>
    </div>
    <div class="drawer-body">
      ${c.flags && c.flags.length ? c.flags.map(f=>`
        <div class="flag ${f.type==='critical'?'flag-critical':'flag-info'}" style="margin-bottom:14px;">
          ${f.type==='critical'?ICONS.warn:ICONS.star}<span>${esc(f.text)}</span>
        </div>
      `).join('') : ''}

      <div class="dsec">
        <div class="dsec-head"><h4>Profile</h4></div>
        <div class="add-inline"><input id="coName" value="${esc(c.name)}" placeholder="Company name"></div>
        <div class="add-inline"><input id="coType" value="${esc(c.type)}" placeholder="Type — e.g. Indigenous — Private E&amp;P"></div>
        <div class="add-inline"><input id="coSector" list="coSectorOptions" value="${esc(c.sector||'')}" placeholder="Sector — e.g. Oil &amp; Gas — Upstream">${sectorDatalist('coSectorOptions')}</div>
        <textarea class="notes-area" id="coSummary" placeholder="Short profile…">${esc(c.summary)}</textarea>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveIdentityBtn">Save details</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Visibility ${c.visibility==='personal'?`<span class="chip chip-low" style="font-size:9px;">Personal</span>`:`<span class="chip chip-good" style="font-size:9px;">General</span>`}</h4></div>
        <div class="add-inline">
          <select id="coAssignee"><option value="">— unassigned —</option>${TEAM_ROSTER.members.map(t=>`<option value="${t.id}" ${c.assignedTo===t.id?'selected':''}>${esc(t.full_name||t.email)}</option>`).join('')}</select>
        </div>
        <div class="small-btn-row">
          <button class="btn btn-sm btn-primary" id="saveAssigneeBtn">Save assignee</button>
          ${c.visibility==='personal' && c.ownerId===AUTH.profile?.id ? `<button class="btn btn-sm btn-ghost" id="shareCompanyBtn">Share to General</button>` : ''}
        </div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Pain points & inspection challenges</h4></div>
        <div class="bullets" id="painList">
          ${c.painPoints.map((p,i)=>`<div class="bullet pain"><span>${esc(p)}</span><button class="x" data-del-pain="${i}">${ICONS.x}</button></div>`).join('')}
        </div>
        <div class="add-inline"><input id="newPain" placeholder="Add a pain point…"><button class="btn btn-sm" id="addPainBtn">${ICONS.plus}</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Current solutions / tech in place</h4></div>
        <div class="bullets" id="curList">
          ${c.currentSolutions.map((p,i)=>`<div class="bullet solution"><span>${esc(p)}</span><button class="x" data-del-cur="${i}">${ICONS.x}</button></div>`).join('')}
        </div>
        <div class="add-inline"><input id="newCur" placeholder="Add current solution / vendor…"><button class="btn btn-sm" id="addCurBtn">${ICONS.plus}</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Products & offers tagged to this account</h4></div>
        ${c.recommended.length===0 ? `<div class="empty" style="padding:16px;">${ICONS.empty}<div>Nothing tagged yet.</div></div>` :
          c.recommended.map((r,i)=>{
            const sol = solutionById(r.sol);
            return `<div class="rec-card">
              <div class="row" style="justify-content:space-between;">
                <div class="rname" ${sol?`data-open-product="${sol.id}" style="cursor:pointer;"`:''}>${sol?esc(sol.name):'(removed)'}</div>
                <button class="x" data-del-rec="${i}" style="background:none;border:none;color:var(--teal-strong);cursor:pointer;">${ICONS.x}</button>
              </div>
              <div class="rwhy">${esc(r.why)}</div>
            </div>`;
          }).join('')}
        <div class="add-inline">
          <select id="recSolSelect">${DATA.solutions.map(s=>`<option value="${s.id}">${esc(s.name)} — ${esc(s.tag)}</option>`).join('')}</select>
        </div>
        <div class="add-inline"><input id="recWhy" placeholder="Why it fits this account…"><button class="btn btn-sm" id="addRecBtn">${ICONS.plus} Tag</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Services tagged to this account</h4></div>
        ${(c.recommendedServices||[]).length===0 ? `<div class="empty" style="padding:16px;">${ICONS.empty}<div>Nothing tagged yet.</div></div>` :
          c.recommendedServices.map((r,i)=>{
            const svc = serviceById(r.svc);
            return `<div class="rec-card">
              <div class="row" style="justify-content:space-between;">
                <div class="rname" ${svc?`data-open-service="${svc.id}" style="cursor:pointer;"`:''}>${svc?esc(svc.name):'(removed)'}</div>
                <button class="x" data-del-rec-svc="${i}" style="background:none;border:none;color:var(--teal-strong);cursor:pointer;">${ICONS.x}</button>
              </div>
              <div class="rwhy">${esc(r.why)}</div>
            </div>`;
          }).join('')}
        <div class="add-inline">
          <select id="recSvcSelect">${DATA.services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        </div>
        <div class="add-inline"><input id="recSvcWhy" placeholder="Why it fits this account…"><button class="btn btn-sm" id="addRecSvcBtn">${ICONS.plus} Tag</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Contacts (${c.contacts.length})</h4></div>
        ${c.contacts.length===0 ? `<div class="empty" style="padding:14px;">${ICONS.empty}<div>No contacts yet.</div></div>` :
          c.contacts.map(ct=>renderContactRow(ct, true)).join('')}
        <button class="btn btn-sm" id="addContactInline" style="margin-top:4px;">${ICONS.plus} Add contact</button>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Actions (${tasks.length})</h4></div>
        ${tasks.length===0 ? `<div class="empty" style="padding:14px;">${ICONS.empty}<div>No actions yet.</div></div>` :
          tasks.map(t=>`
            <div class="task-row ${t.done?'done':''}">
              <input type="checkbox" data-toggle-task="${t.id}" ${t.done?'checked':''}>
              <div style="flex:1">
                <div class="t">${esc(t.title)}${t.visibility==='personal'?` <span class="chip chip-low" style="font-size:9px;">Personal</span>`:''}</div>
                <div class="meta ${!t.done && isOverdue(t.due)?'overdue':''}">${t.due?('Due '+fmtDate(t.due)):'No date'} · ${t.priority}</div>
              </div>
              ${t.visibility==='personal' && t.ownerId===AUTH.profile?.id?`<button class="x" data-share-task="${t.id}" title="Share to general" style="background:none;border:none;color:var(--faint);cursor:pointer;">${ICONS.upload}</button>`:''}
              <button class="x" data-del-task="${t.id}" style="background:none;border:none;color:var(--faint);cursor:pointer;">${ICONS.x}</button>
            </div>
          `).join('')}
        <button class="btn btn-sm" id="addTaskInline" style="margin-top:8px;">${ICONS.plus} Add action</button>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Notes</h4></div>
        <textarea class="notes-area" id="notesArea">${esc(c.notes||'')}</textarea>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveNotesBtn">Save notes</button></div>
      </div>
    </div>
  `;
  bindDrawer(c);
}

function renderContactRow(ct, compact){
  return `
    <div class="contact-row" data-contact="${ct.id}">
      <div class="avatar">${initials(ct.name)}</div>
      <div class="info">
        <div class="cname">${esc(ct.name)} ${ct.verified?`<span class="verified-tick" title="LinkedIn-verified title">✓</span>`:''}</div>
        <div class="cpos">${esc(ct.pos)}</div>
        <div class="cmeta">
          ${ct.email ? `<span>${ICONS.mail} ${esc(ct.email)}</span>` : `<span style="color:var(--faint)">${ICONS.mail} Not public</span>`}
          ${ct.phone ? `<span>${ICONS.phone} ${esc(ct.phone)}</span>` : ''}
          ${ct.linkedin ? `<a href="https://${esc(stripProto(ct.linkedin))}" target="_blank" rel="noopener">${ICONS.linkedin} ${esc(ct.linkedin)}</a>` : ''}
          ${ct.nextFollowUp ? `<span style="color:${isOverdue(ct.nextFollowUp)?'var(--critical)':'var(--muted)'}">Follow up ${fmtDate(ct.nextFollowUp)}</span>` : ''}
        </div>
      </div>
      <div class="cactions">
        ${ct.email?`<button class="btn btn-sm btn-ghost" data-email-contact="${ct.id}">${ICONS.send} Email</button>`:''}
        <button class="btn btn-sm btn-ghost" data-mark-contacted="${ct.id}">Mark contacted</button>
        <button class="btn btn-sm btn-ghost" data-edit-contact="${ct.id}">Edit</button>
      </div>
    </div>
  `;
}

function bindDrawer(c){
  document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
  document.getElementById('stageSelect').addEventListener('change', e=>setCompanyStage(c, e.target.value, {inDrawer:true}));
  document.getElementById('prioritySelect').addEventListener('change', e=>setCompanyPriority(c, e.target.value));
  document.getElementById('deleteCompanyBtn').addEventListener('click', ()=>{
    openConfirmModal(`Remove ${c.name} and all its contacts/tasks? This can't be undone.`, async ()=>{
      try{
        await companiesApi.remove(c.id);
        DATA.companies = DATA.companies.filter(x=>x.id!==c.id);
        DATA.tasks = DATA.tasks.filter(t=>t.companyId!==c.id);   // tasks.company_id cascades in the DB too
        logActivity('Removed an account', c.name); closeDrawer(); renderApp();
        toast('Account removed');
      }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
    });
  });

  document.getElementById('saveIdentityBtn').addEventListener('click', async ()=>{
    const name = document.getElementById('coName').value.trim();
    if (!name){ toast('Name required'); return; }
    const type = document.getElementById('coType').value.trim();
    const sector = document.getElementById('coSector').value.trim();
    const summary = document.getElementById('coSummary').value.trim();
    try{
      await companiesApi.updateIdentity(c.id, {name, type, summary, sector});
      c.name = name; c.type = type; c.sector = sector; c.summary = summary;
      toast('Details saved'); renderApp(); openDrawer(c.id);
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });

  document.getElementById('saveAssigneeBtn').addEventListener('click', async ()=>{
    const assignedTo = document.getElementById('coAssignee').value;
    try{
      await companiesApi.setAssignee(c.id, assignedTo);
      c.assignedTo = assignedTo;
      toast('Assignee saved'); renderApp(); openDrawer(c.id);
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  const shareCompanyBtn = document.getElementById('shareCompanyBtn');
  if (shareCompanyBtn) shareCompanyBtn.addEventListener('click', ()=>{
    openConfirmModal('Share this account to General? Every member will be able to see and act on it — this can\'t be undone.', async ()=>{
      try{
        await companiesApi.shareToGeneral(c.id);
        c.visibility = 'general';
        renderApp(); openDrawer(c.id); toast('Shared to General');
      }catch(e){ toast('Could not share — ' + (e.message || 'try again')); }
    }, 'Share');
  });

  document.getElementById('addPainBtn').addEventListener('click', async ()=>{
    const inp = document.getElementById('newPain');
    if (!inp.value.trim()) return;
    const next = [...c.painPoints, inp.value.trim()];
    try{ await companiesApi.setPainPoints(c.id, next); c.painPoints = next; openDrawer(c.id); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-pain]').forEach(b=>b.addEventListener('click', async ()=>{
    const next = c.painPoints.filter((_,i)=>i!==+b.dataset.delPain);
    try{ await companiesApi.setPainPoints(c.id, next); c.painPoints = next; openDrawer(c.id); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  }));

  document.getElementById('addCurBtn').addEventListener('click', async ()=>{
    const inp = document.getElementById('newCur');
    if (!inp.value.trim()) return;
    const next = [...c.currentSolutions, inp.value.trim()];
    try{ await companiesApi.setCurrentSolutions(c.id, next); c.currentSolutions = next; openDrawer(c.id); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-cur]').forEach(b=>b.addEventListener('click', async ()=>{
    const next = c.currentSolutions.filter((_,i)=>i!==+b.dataset.delCur);
    try{ await companiesApi.setCurrentSolutions(c.id, next); c.currentSolutions = next; openDrawer(c.id); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  }));

  document.getElementById('addRecBtn').addEventListener('click', async ()=>{
    const sel = document.getElementById('recSolSelect');
    const why = document.getElementById('recWhy');
    if (!sel.value || !why.value.trim()) return;
    try{
      await companiesApi.tagProduct(c.id, sel.value, why.value.trim());
      c.recommended = c.recommended.filter(r=>r.sol!==sel.value);
      c.recommended.push({sol:sel.value, why:why.value.trim()});
      logActivity('Tagged a product to an account', `${solutionById(sel.value)?.name||sel.value} → ${c.name}`);
      openDrawer(c.id); renderView();
    }catch(e){ toast('Could not tag — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-rec]').forEach(b=>b.addEventListener('click', async ()=>{
    const r = c.recommended[+b.dataset.delRec];
    if (!r) return;
    try{
      await companiesApi.untagProduct(c.id, r.sol);
      c.recommended.splice(+b.dataset.delRec,1);
      openDrawer(c.id); renderView();
    }catch(e){ toast('Could not untag — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-open-product]').forEach(el=>el.addEventListener('click', ()=>openProductDrawer(el.dataset.openProduct)));

  document.getElementById('addRecSvcBtn').addEventListener('click', async ()=>{
    const sel = document.getElementById('recSvcSelect');
    const why = document.getElementById('recSvcWhy');
    if (!sel.value || !why.value.trim()) return;
    try{
      await companiesApi.tagService(c.id, sel.value, why.value.trim());
      c.recommendedServices = (c.recommendedServices||[]).filter(r=>r.svc!==sel.value);
      c.recommendedServices.push({svc:sel.value, why:why.value.trim()});
      logActivity('Tagged a service to an account', `${serviceById(sel.value)?.name||sel.value} → ${c.name}`);
      openDrawer(c.id); renderView();
    }catch(e){ toast('Could not tag — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-rec-svc]').forEach(b=>b.addEventListener('click', async ()=>{
    const r = (c.recommendedServices||[])[+b.dataset.delRecSvc];
    if (!r) return;
    try{
      await companiesApi.untagService(c.id, r.svc);
      c.recommendedServices.splice(+b.dataset.delRecSvc,1);
      openDrawer(c.id); renderView();
    }catch(e){ toast('Could not untag — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-open-service]').forEach(el=>el.addEventListener('click', ()=>openServiceDrawer(el.dataset.openService)));

  document.getElementById('addContactInline').addEventListener('click', ()=>openAddContactModal(c.id));
  document.querySelectorAll('[data-edit-contact]').forEach(b=>b.addEventListener('click', ()=>openEditContactModal(b.dataset.editContact)));
  document.querySelectorAll('[data-email-contact]').forEach(b=>b.addEventListener('click', ()=>openEmailModal(b.dataset.emailContact)));
  document.querySelectorAll('[data-mark-contacted]').forEach(b=>b.addEventListener('click', async ()=>{
    const ct = findContact(b.dataset.markContacted);
    if (!ct) return;
    const today = new Date().toISOString().slice(0,10);
    try{
      const saved = await contactsApi.markContacted(ct.id, today);
      Object.assign(ct, saved);
      toast('Marked as contacted today'); openDrawer(c.id);
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  }));

  document.querySelectorAll('[data-toggle-task]').forEach(b=>b.addEventListener('change', async ()=>{
    const t = DATA.tasks.find(x=>x.id===b.dataset.toggleTask);
    if (!t) return;
    try{ await tasksApi.toggleDone(t.id, b.checked); t.done = b.checked; }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
    renderApp(); openDrawer(c.id);
  }));
  document.querySelectorAll('[data-del-task]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = b.dataset.delTask;
    try{
      await tasksApi.remove(id);
      DATA.tasks = DATA.tasks.filter(t=>t.id!==id);
      renderApp(); openDrawer(c.id);
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-share-task]').forEach(b=>b.addEventListener('click', ()=>{
    const t = DATA.tasks.find(x=>x.id===b.dataset.shareTask);
    if (!t) return;
    openConfirmModal('Share this action to General? Everyone will be able to see and act on it — this can\'t be undone.', async ()=>{
      try{ await tasksApi.shareToGeneral(t.id); t.visibility = 'general'; renderApp(); openDrawer(c.id); toast('Shared to General'); }
      catch(e){ toast('Could not share — ' + (e.message || 'try again')); }
    }, 'Share');
  }));
  document.getElementById('addTaskInline').addEventListener('click', ()=>openAddTaskModal(c.id));

  document.getElementById('saveNotesBtn').addEventListener('click', async ()=>{
    const notes = document.getElementById('notesArea').value;
    try{ await companiesApi.setNotes(c.id, notes); c.notes = notes; toast('Notes saved'); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
}

function findContact(id){
  for (const c of DATA.companies){ const ct = c.contacts.find(x=>x.id===id); if (ct) return ct; }
  return null;
}

/* ============================================================
   PRODUCT / OFFER DRAWER
   ============================================================ */
function taggedCompaniesFor(productId){
  const rows = [];
  DATA.companies.forEach(c=>{
    c.recommended.forEach((r,i)=>{ if (r.sol===productId) rows.push({company:c, why:r.why, index:i}); });
  });
  return rows;
}
function untaggedCompaniesFor(productId){
  const taggedIds = new Set(taggedCompaniesFor(productId).map(r=>r.company.id));
  return DATA.companies.filter(c=>!taggedIds.has(c.id));
}
const STATUS_OPTIONS = ['Active','Pilot','Planned','Pending Review'];
const KIND_OPTIONS = ['Product','Offer'];
function statusChipClass(status){
  return status==='Active' ? 'chip-good' : status==='Pilot' ? 'chip-medium' : 'chip-low';
}

// Share section (V2 HT-C) — shared by the product and service drawers.
// Members-only: sharing doesn't grant new access (every member can already
// read every catalog item, flat RLS) — it's a pointer + a "Shared with me"
// filter, plus a deep link that only works for someone already signed in.
function renderShareSection(kind, id){
  const ready = ITEM_SHARE.key === `${kind}:${id}`;
  const shares = ready ? ITEM_SHARE.shares : [];
  const teammates = ready ? ITEM_SHARE.teammates : [];
  const shareable = teammates.filter(t=>t.id!==AUTH.profile.id && !shares.some(sh=>sh.shared_with===t.id));
  return `
    <div class="dsec">
      <div class="dsec-head"><h4>Share</h4></div>
      ${!ready ? `<div class="sub">Loading…</div>` : `
        ${shares.length===0 ? `<div class="empty" style="padding:12px;">${ICONS.empty}<div>Not shared with anyone yet.</div></div>` :
          shares.map(sh=>{
            const who = teammates.find(t=>t.id===sh.shared_with);
            return `<div class="bullet solution"><span style="flex:1;">${esc(who?(who.full_name||who.email):'Unknown')}</span><button class="x" data-revoke-share="${sh.id}">${ICONS.x}</button></div>`;
          }).join('')}
        ${shareable.length===0 ? '' : `
        <div class="add-inline">
          <select id="shareTeammate">${shareable.map(t=>`<option value="${t.id}">${esc(t.full_name||t.email)}</option>`).join('')}</select>
          <button class="btn btn-sm" id="shareBtn">${ICONS.plus} Share</button>
        </div>`}
      `}
      <div class="small-btn-row" style="margin-top:8px;"><button class="btn btn-sm btn-ghost" id="copyShareLinkBtn">Copy link</button></div>
    </div>
  `;
}
function bindShareSection(kind, id){
  if (ITEM_SHARE.key !== `${kind}:${id}`) loadItemShares(kind, id);
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) shareBtn.addEventListener('click', async ()=>{
    const sel = document.getElementById('shareTeammate');
    if (!sel || !sel.value) return;
    try{
      await storeSharesApi.share(kind, id, AUTH.profile.id, sel.value);
      ITEM_SHARE.key = null; loadItemShares(kind, id);
      toast('Shared');
    }catch(e){ toast('Could not share — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-revoke-share]').forEach(b=>b.addEventListener('click', async ()=>{
    try{
      await storeSharesApi.revoke(b.dataset.revokeShare);
      ITEM_SHARE.key = null; loadItemShares(kind, id);
      toast('Share revoked');
    }catch(e){ toast('Could not revoke — ' + (e.message || 'try again')); }
  }));
  const copyBtn = document.getElementById('copyShareLinkBtn');
  if (copyBtn) copyBtn.addEventListener('click', async ()=>{
    const link = storeSharesApi.shareLink(kind, id);
    try{ await navigator.clipboard.writeText(link); toast('Link copied'); }
    catch(e){ openLinkModal('Share link', 'Works for anyone already signed in as a member — it opens straight to this item.', link); }
  });
}

function renderProductDrawer(){
  const p = solutionById(ui.drawerProductId);
  const drawer = document.getElementById('drawer');
  if (!p){ drawer.innerHTML=''; return; }
  const tagged = taggedCompaniesFor(p.id);
  const untagged = untaggedCompaniesFor(p.id);
  const highlights = p.highlights || [];

  drawer.innerHTML = `
    <button class="drawer-close" id="drawerCloseBtn">${ICONS.x}</button>
    <div class="drawer-head">
      <div class="eyebrow">${esc(p.tag||'General')} · ${esc(p.kind||'Product')}</div>
      <h2>${esc(p.name)}</h2>
      <div class="field-row">
        <select id="statusSelect">${STATUS_OPTIONS.map(s=>`<option value="${s}" ${(p.status||'Active')===s?'selected':''}>${s}</option>`).join('')}</select>
        <select id="kindSelect">${KIND_OPTIONS.map(k=>`<option value="${k}" ${(p.kind||'Product')===k?'selected':''}>${k}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="deleteProductBtn" style="color:#f3d9d6;border:1px solid var(--navy-line);">Remove product</button>
      </div>
    </div>
    <div class="drawer-body">
      <div class="dsec">
        <div class="dsec-head"><h4>Identity</h4></div>
        <div class="add-inline"><input id="pName" value="${esc(p.name)}" placeholder="Product / offer name"></div>
        <div class="add-inline"><input id="pTag" value="${esc(p.tag||'')}" placeholder="Category / tag — e.g. Aerial"></div>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveIdentityBtn">Save details</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Store details</h4></div>
        <div class="add-inline">
          <select id="pCategory">${DATA.settings.productCategories.map(c=>`<option value="${c.id}" ${p.categoryId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
        </div>
        <div class="add-inline"><input id="pVendor" value="${esc(p.vendorName||'')}" placeholder="Vendor / OEM name"></div>
        <div class="add-inline">
          <input id="pPriceAmount" type="number" min="0" step="0.01" value="${p.priceAmount==null?'':p.priceAmount}" placeholder="Price">
          <select id="pPriceCurrency"><option value="NGN" ${p.priceCurrency==='NGN'?'selected':''}>NGN</option><option value="USD" ${p.priceCurrency==='USD'?'selected':''}>USD</option></select>
        </div>
        <label class="row" style="gap:6px;align-items:center;font-size:12px;color:var(--muted);margin:6px 0;">
          <input type="checkbox" id="pOem" ${p.oem?'checked':''}> OEM part (enables the datasheet attachment below)
        </label>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveStoreDetailsBtn">Save store details</button></div>

        <div id="datasheetRow" style="${p.oem?'':'display:none;'}margin-top:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">Datasheet (OEM parts only)</div>
          ${p.datasheetPath
            ? `<div class="bullet solution"><span style="flex:1;">${esc(p.datasheetPath.split('/').pop())}</span><button class="btn btn-sm btn-ghost" id="viewDatasheetBtn">Open</button><button class="x" id="removeDatasheetBtn">${ICONS.x}</button></div>`
            : `<input type="file" id="datasheetFile" accept=".pdf,.doc,.docx,.xls,.xlsx">`}
        </div>

        <div style="margin-top:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">Images</div>
          <div class="bullets" id="imgList">
            ${(p.imagePaths||[]).map((path,i)=>`<div class="bullet solution"><span style="flex:1;">${esc(path.split('/').pop())}</span><button class="btn btn-sm btn-ghost" data-view-img="${esc(path)}">View</button><button class="x" data-del-img="${i}">${ICONS.x}</button></div>`).join('')}
          </div>
          <div class="add-inline"><input type="file" id="imageFile" accept="image/*"></div>
        </div>

        <div class="small-btn-row" style="margin-top:12px;">
          ${p.archivedAt
            ? `<button class="btn btn-sm btn-ghost" id="unarchiveProductBtn">Unarchive</button>`
            : `<button class="btn btn-sm btn-ghost" id="archiveProductBtn">Archive</button>`}
        </div>
      </div>

      ${renderShareSection('product', p.id)}

      <div class="dsec">
        <div class="dsec-head"><h4>Description</h4></div>
        <textarea class="notes-area" id="blurbArea">${esc(p.blurb||'')}</textarea>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveBlurbBtn">Save description</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Highlights & capabilities</h4></div>
        <div class="bullets" id="hlList">
          ${highlights.length===0 ? `<div class="empty" style="padding:12px;">${ICONS.empty}<div>No highlights yet.</div></div>` :
            highlights.map((h,i)=>`<div class="bullet solution"><span>${esc(h)}</span><button class="x" data-del-hl="${i}">${ICONS.x}</button></div>`).join('')}
        </div>
        <div class="add-inline"><input id="newHl" placeholder="Add a highlight or capability…"><button class="btn btn-sm" id="addHlBtn">${ICONS.plus}</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Tagged clients (${tagged.length})</h4></div>
        ${tagged.length===0 ? `<div class="empty" style="padding:16px;">${ICONS.empty}<div>Not tagged to any account yet.</div></div>` :
          tagged.map(row=>`
            <div class="rec-card">
              <div class="row" style="justify-content:space-between;">
                <div class="rname" data-open-company="${row.company.id}" style="cursor:pointer;">${esc(row.company.name)}</div>
                <button class="x" data-untag="${row.company.id}" style="background:none;border:none;color:var(--teal-strong);cursor:pointer;">${ICONS.x}</button>
              </div>
              <div class="rwhy">${esc(row.why)}</div>
            </div>
          `).join('')}
        ${untagged.length===0 ? '' : `
        <div class="add-inline">
          <select id="tagCoSelect">${untagged.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        </div>
        <div class="add-inline"><input id="tagWhy" placeholder="Why it fits this account…"><button class="btn btn-sm" id="addTagBtn">${ICONS.plus} Tag client</button></div>
        `}
      </div>
    </div>
  `;
  bindProductDrawer(p);
}

function bindProductDrawer(p){
  document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
  bindShareSection('product', p.id);
  document.getElementById('statusSelect').addEventListener('change', async e=>{
    const status = e.target.value;
    try{ await productsApi.setStatus(p.id, status); p.status = status; }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
    renderProductDrawer(); renderView();
  });
  document.getElementById('kindSelect').addEventListener('change', async e=>{
    const kind = e.target.value;
    try{ await productsApi.setKind(p.id, kind); p.kind = kind; }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
    renderProductDrawer(); renderView();
  });
  document.getElementById('saveIdentityBtn').addEventListener('click', async ()=>{
    const name = document.getElementById('pName').value.trim();
    if (!name){ toast('Name required'); return; }
    const tag = document.getElementById('pTag').value.trim();
    try{
      await productsApi.editIdentity(p.id, {name, tag});
      p.name = name; p.tag = tag;
      toast('Details saved'); renderApp(); openProductDrawer(p.id);
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });

  document.getElementById('pCategory').addEventListener('change', async e=>{
    const categoryId = e.target.value;
    try{ await productsApi.setCategory(p.id, categoryId); p.categoryId = categoryId; toast('Category saved'); renderView(); }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
  });
  document.getElementById('pOem').addEventListener('change', async e=>{
    const oem = e.target.checked;
    try{ await productsApi.setOem(p.id, oem); p.oem = oem; renderProductDrawer(); }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
  });
  document.getElementById('saveStoreDetailsBtn').addEventListener('click', async ()=>{
    const vendorName = document.getElementById('pVendor').value.trim();
    const amountRaw = document.getElementById('pPriceAmount').value;
    const amount = amountRaw==='' ? null : Number(amountRaw);
    const currency = document.getElementById('pPriceCurrency').value;
    try{
      await productsApi.setVendor(p.id, vendorName);
      await productsApi.setPrice(p.id, {amount, currency});
      p.vendorName = vendorName; p.priceAmount = amount; p.priceCurrency = currency;
      toast('Store details saved'); renderView();
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  const datasheetFile = document.getElementById('datasheetFile');
  if (datasheetFile) datasheetFile.addEventListener('change', async ()=>{
    const file = datasheetFile.files[0]; if (!file) return;
    try{
      const path = await uploadFile(file, `products/${p.id}/datasheet`);
      await productsApi.setDatasheet(p.id, path);
      p.datasheetPath = path;
      renderProductDrawer(); toast('Datasheet uploaded');
    }catch(e){ toast('Could not upload — ' + (e.message || 'try again')); }
  });
  const viewDatasheetBtn = document.getElementById('viewDatasheetBtn');
  if (viewDatasheetBtn) viewDatasheetBtn.addEventListener('click', async ()=>{
    const url = await signedUrl(p.datasheetPath);
    if (url) window.open(url, '_blank'); else toast('Could not open datasheet');
  });
  const removeDatasheetBtn = document.getElementById('removeDatasheetBtn');
  if (removeDatasheetBtn) removeDatasheetBtn.addEventListener('click', async ()=>{
    try{
      await productsApi.setDatasheet(p.id, null);
      await removeFile(p.datasheetPath);
      p.datasheetPath = ''; renderProductDrawer(); toast('Datasheet removed');
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  });
  const imageFile = document.getElementById('imageFile');
  if (imageFile) imageFile.addEventListener('change', async ()=>{
    const file = imageFile.files[0]; if (!file) return;
    try{
      const path = await uploadFile(file, `products/${p.id}/images`);
      const next = [...(p.imagePaths||[]), path];
      await productsApi.setImages(p.id, next);
      p.imagePaths = next; renderProductDrawer(); toast('Image added');
    }catch(e){ toast('Could not upload — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-img]').forEach(b=>b.addEventListener('click', async ()=>{
    const i = +b.dataset.delImg;
    const path = p.imagePaths[i];
    const next = p.imagePaths.filter((_,idx)=>idx!==i);
    try{
      await productsApi.setImages(p.id, next);
      await removeFile(path);
      p.imagePaths = next; renderProductDrawer(); toast('Image removed');
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-view-img]').forEach(b=>b.addEventListener('click', async ()=>{
    const url = await signedUrl(b.dataset.viewImg);
    if (url) window.open(url, '_blank'); else toast('Could not open image');
  }));
  const archiveProductBtn = document.getElementById('archiveProductBtn');
  if (archiveProductBtn) archiveProductBtn.addEventListener('click', async ()=>{
    try{ await productsApi.archive(p.id); p.archivedAt = new Date().toISOString(); renderProductDrawer(); renderView(); toast('Archived'); }
    catch(e){ toast('Could not archive — ' + (e.message || 'try again')); }
  });
  const unarchiveProductBtn = document.getElementById('unarchiveProductBtn');
  if (unarchiveProductBtn) unarchiveProductBtn.addEventListener('click', async ()=>{
    try{ await productsApi.unarchive(p.id); p.archivedAt = ''; renderProductDrawer(); renderView(); toast('Unarchived'); }
    catch(e){ toast('Could not unarchive — ' + (e.message || 'try again')); }
  });

  document.getElementById('deleteProductBtn').addEventListener('click', ()=>{
    openConfirmModal(`Remove ${p.name}? It will also be untagged from every account.`, async ()=>{
      try{
        await productsApi.remove(p.id);
        DATA.companies.forEach(c=>{ c.recommended = c.recommended.filter(r=>r.sol!==p.id); });
        DATA.solutions = DATA.solutions.filter(x=>x.id!==p.id);
        closeDrawer(); renderApp();
        toast('Product removed');
      }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
    });
  });

  document.getElementById('saveBlurbBtn').addEventListener('click', async ()=>{
    const blurb = document.getElementById('blurbArea').value;
    try{ await productsApi.setBlurb(p.id, blurb); p.blurb = blurb; toast('Description saved'); renderView(); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });

  if (!p.highlights) p.highlights = [];
  document.getElementById('addHlBtn').addEventListener('click', async ()=>{
    const inp = document.getElementById('newHl');
    if (!inp.value.trim()) return;
    const next = [...p.highlights, inp.value.trim()];
    try{ await productsApi.setHighlights(p.id, next); p.highlights = next; renderProductDrawer(); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-hl]').forEach(b=>b.addEventListener('click', async ()=>{
    const next = p.highlights.filter((_,i)=>i!==+b.dataset.delHl);
    try{ await productsApi.setHighlights(p.id, next); p.highlights = next; renderProductDrawer(); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  }));

  document.querySelectorAll('[data-open-company]').forEach(el=>el.addEventListener('click', ()=>openDrawer(el.dataset.openCompany)));
  document.querySelectorAll('[data-untag]').forEach(b=>b.addEventListener('click', async ()=>{
    const co = companyById(b.dataset.untag);
    if (!co) return;
    try{
      await companiesApi.untagProduct(co.id, p.id);
      co.recommended = co.recommended.filter(r=>r.sol!==p.id);
      renderProductDrawer(); renderView();
    }catch(e){ toast('Could not untag — ' + (e.message || 'try again')); }
  }));
  const addTagBtn = document.getElementById('addTagBtn');
  if (addTagBtn) addTagBtn.addEventListener('click', async ()=>{
    const sel = document.getElementById('tagCoSelect');
    const why = document.getElementById('tagWhy');
    const co = companyById(sel.value);
    if (co && why.value.trim()){
      try{
        await companiesApi.tagProduct(co.id, p.id, why.value.trim());
        co.recommended = co.recommended.filter(r=>r.sol!==p.id);
        co.recommended.push({sol:p.id, why:why.value.trim()});
        logActivity('Tagged a product to an account', `${p.name} → ${co.name}`);
        renderProductDrawer(); renderView(); toast('Tagged to '+co.name);
      }catch(e){ toast('Could not tag — ' + (e.message || 'try again')); }
    }
    else if (co && !why.value.trim()){ toast('Add a short reason first'); }
  });
}

/* ============================================================
   SERVICE DRAWER (V2 HT-B) — mirrors the product drawer above, minus
   vendor/OEM/datasheet (services aren't OEM parts).
   ============================================================ */
function renderServiceDrawer(){
  const s = serviceById(ui.drawerServiceId);
  const drawer = document.getElementById('drawer');
  if (!s){ drawer.innerHTML=''; return; }
  const tagged = taggedCompaniesForService(s.id);
  const untagged = untaggedCompaniesForService(s.id);
  const highlights = s.highlights || [];

  drawer.innerHTML = `
    <button class="drawer-close" id="drawerCloseBtn">${ICONS.x}</button>
    <div class="drawer-head">
      <div class="eyebrow">${esc(categoryName(DATA.settings.serviceCategories, s.categoryId)||'Service')}</div>
      <h2>${esc(s.name)}</h2>
      <div class="field-row">
        <select id="statusSelect">${STATUS_OPTIONS.map(o=>`<option value="${o}" ${(s.status||'Active')===o?'selected':''}>${o}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="deleteServiceBtn" style="color:#f3d9d6;border:1px solid var(--navy-line);">Remove service</button>
      </div>
    </div>
    <div class="drawer-body">
      <div class="dsec">
        <div class="dsec-head"><h4>Identity</h4></div>
        <div class="add-inline"><input id="sName" value="${esc(s.name)}" placeholder="Service name"></div>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveIdentityBtn">Save details</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Store details</h4></div>
        <div class="add-inline">
          <select id="sCategory">${DATA.settings.serviceCategories.map(c=>`<option value="${c.id}" ${s.categoryId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
        </div>
        <div class="add-inline">
          <input id="sPriceAmount" type="number" min="0" step="0.01" value="${s.priceAmount==null?'':s.priceAmount}" placeholder="Price">
          <select id="sPriceCurrency"><option value="NGN" ${s.priceCurrency==='NGN'?'selected':''}>NGN</option><option value="USD" ${s.priceCurrency==='USD'?'selected':''}>USD</option></select>
        </div>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="savePriceBtn">Save store details</button></div>

        <div style="margin-top:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;">Images</div>
          <div class="bullets" id="imgList">
            ${(s.imagePaths||[]).map((path,i)=>`<div class="bullet solution"><span style="flex:1;">${esc(path.split('/').pop())}</span><button class="btn btn-sm btn-ghost" data-view-img="${esc(path)}">View</button><button class="x" data-del-img="${i}">${ICONS.x}</button></div>`).join('')}
          </div>
          <div class="add-inline"><input type="file" id="imageFile" accept="image/*"></div>
        </div>

        <div class="small-btn-row" style="margin-top:12px;">
          ${s.archivedAt
            ? `<button class="btn btn-sm btn-ghost" id="unarchiveServiceBtn">Unarchive</button>`
            : `<button class="btn btn-sm btn-ghost" id="archiveServiceBtn">Archive</button>`}
        </div>
      </div>

      ${renderShareSection('service', s.id)}

      <div class="dsec">
        <div class="dsec-head"><h4>Description</h4></div>
        <textarea class="notes-area" id="blurbArea">${esc(s.blurb||'')}</textarea>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveBlurbBtn">Save description</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Highlights & capabilities</h4></div>
        <div class="bullets" id="hlList">
          ${highlights.length===0 ? `<div class="empty" style="padding:12px;">${ICONS.empty}<div>No highlights yet.</div></div>` :
            highlights.map((h,i)=>`<div class="bullet solution"><span>${esc(h)}</span><button class="x" data-del-hl="${i}">${ICONS.x}</button></div>`).join('')}
        </div>
        <div class="add-inline"><input id="newHl" placeholder="Add a highlight or capability…"><button class="btn btn-sm" id="addHlBtn">${ICONS.plus}</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Tagged clients (${tagged.length})</h4></div>
        ${tagged.length===0 ? `<div class="empty" style="padding:16px;">${ICONS.empty}<div>Not tagged to any account yet.</div></div>` :
          tagged.map(row=>`
            <div class="rec-card">
              <div class="row" style="justify-content:space-between;">
                <div class="rname" data-open-company="${row.company.id}" style="cursor:pointer;">${esc(row.company.name)}</div>
                <button class="x" data-untag="${row.company.id}" style="background:none;border:none;color:var(--teal-strong);cursor:pointer;">${ICONS.x}</button>
              </div>
              <div class="rwhy">${esc(row.why)}</div>
            </div>
          `).join('')}
        ${untagged.length===0 ? '' : `
        <div class="add-inline">
          <select id="tagCoSelect">${untagged.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        </div>
        <div class="add-inline"><input id="tagWhy" placeholder="Why it fits this account…"><button class="btn btn-sm" id="addTagBtn">${ICONS.plus} Tag client</button></div>
        `}
      </div>
    </div>
  `;
  bindServiceDrawer(s);
}

function bindServiceDrawer(s){
  document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
  bindShareSection('service', s.id);
  document.getElementById('statusSelect').addEventListener('change', async e=>{
    const status = e.target.value;
    try{ await servicesApi.setStatus(s.id, status); s.status = status; }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
    renderServiceDrawer(); renderView();
  });
  document.getElementById('saveIdentityBtn').addEventListener('click', async ()=>{
    const name = document.getElementById('sName').value.trim();
    if (!name){ toast('Name required'); return; }
    try{
      await servicesApi.editIdentity(s.id, {name});
      s.name = name;
      toast('Details saved'); renderApp(); openServiceDrawer(s.id);
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  document.getElementById('sCategory').addEventListener('change', async e=>{
    const categoryId = e.target.value;
    try{ await servicesApi.setCategory(s.id, categoryId); s.categoryId = categoryId; toast('Category saved'); renderView(); }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
  });
  document.getElementById('savePriceBtn').addEventListener('click', async ()=>{
    const amountRaw = document.getElementById('sPriceAmount').value;
    const amount = amountRaw==='' ? null : Number(amountRaw);
    const currency = document.getElementById('sPriceCurrency').value;
    try{
      await servicesApi.setPrice(s.id, {amount, currency});
      s.priceAmount = amount; s.priceCurrency = currency;
      toast('Store details saved'); renderView();
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  const imageFile = document.getElementById('imageFile');
  if (imageFile) imageFile.addEventListener('change', async ()=>{
    const file = imageFile.files[0]; if (!file) return;
    try{
      const path = await uploadFile(file, `services/${s.id}/images`);
      const next = [...(s.imagePaths||[]), path];
      await servicesApi.setImages(s.id, next);
      s.imagePaths = next; renderServiceDrawer(); toast('Image added');
    }catch(e){ toast('Could not upload — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-img]').forEach(b=>b.addEventListener('click', async ()=>{
    const i = +b.dataset.delImg;
    const path = s.imagePaths[i];
    const next = s.imagePaths.filter((_,idx)=>idx!==i);
    try{
      await servicesApi.setImages(s.id, next);
      await removeFile(path);
      s.imagePaths = next; renderServiceDrawer(); toast('Image removed');
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-view-img]').forEach(b=>b.addEventListener('click', async ()=>{
    const url = await signedUrl(b.dataset.viewImg);
    if (url) window.open(url, '_blank'); else toast('Could not open image');
  }));
  const archiveServiceBtn = document.getElementById('archiveServiceBtn');
  if (archiveServiceBtn) archiveServiceBtn.addEventListener('click', async ()=>{
    try{ await servicesApi.archive(s.id); s.archivedAt = new Date().toISOString(); renderServiceDrawer(); renderView(); toast('Archived'); }
    catch(e){ toast('Could not archive — ' + (e.message || 'try again')); }
  });
  const unarchiveServiceBtn = document.getElementById('unarchiveServiceBtn');
  if (unarchiveServiceBtn) unarchiveServiceBtn.addEventListener('click', async ()=>{
    try{ await servicesApi.unarchive(s.id); s.archivedAt = ''; renderServiceDrawer(); renderView(); toast('Unarchived'); }
    catch(e){ toast('Could not unarchive — ' + (e.message || 'try again')); }
  });
  document.getElementById('deleteServiceBtn').addEventListener('click', ()=>{
    openConfirmModal(`Remove ${s.name}? It will also be untagged from every account.`, async ()=>{
      try{
        await servicesApi.remove(s.id);
        DATA.companies.forEach(c=>{ c.recommendedServices = (c.recommendedServices||[]).filter(r=>r.svc!==s.id); });
        DATA.services = DATA.services.filter(x=>x.id!==s.id);
        closeDrawer(); renderApp();
        toast('Service removed');
      }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
    });
  });

  document.getElementById('saveBlurbBtn').addEventListener('click', async ()=>{
    const blurb = document.getElementById('blurbArea').value;
    try{ await servicesApi.setBlurb(s.id, blurb); s.blurb = blurb; toast('Description saved'); renderView(); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });

  if (!s.highlights) s.highlights = [];
  document.getElementById('addHlBtn').addEventListener('click', async ()=>{
    const inp = document.getElementById('newHl');
    if (!inp.value.trim()) return;
    const next = [...s.highlights, inp.value.trim()];
    try{ await servicesApi.setHighlights(s.id, next); s.highlights = next; renderServiceDrawer(); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-hl]').forEach(b=>b.addEventListener('click', async ()=>{
    const next = s.highlights.filter((_,i)=>i!==+b.dataset.delHl);
    try{ await servicesApi.setHighlights(s.id, next); s.highlights = next; renderServiceDrawer(); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  }));

  document.querySelectorAll('[data-open-company]').forEach(el=>el.addEventListener('click', ()=>openDrawer(el.dataset.openCompany)));
  document.querySelectorAll('[data-untag]').forEach(b=>b.addEventListener('click', async ()=>{
    const co = companyById(b.dataset.untag);
    if (!co) return;
    try{
      await companiesApi.untagService(co.id, s.id);
      co.recommendedServices = (co.recommendedServices||[]).filter(r=>r.svc!==s.id);
      renderServiceDrawer(); renderView();
    }catch(e){ toast('Could not untag — ' + (e.message || 'try again')); }
  }));
  const addTagBtn = document.getElementById('addTagBtn');
  if (addTagBtn) addTagBtn.addEventListener('click', async ()=>{
    const sel = document.getElementById('tagCoSelect');
    const why = document.getElementById('tagWhy');
    const co = companyById(sel.value);
    if (co && why.value.trim()){
      try{
        await companiesApi.tagService(co.id, s.id, why.value.trim());
        co.recommendedServices = (co.recommendedServices||[]).filter(r=>r.svc!==s.id);
        co.recommendedServices.push({svc:s.id, why:why.value.trim()});
        logActivity('Tagged a service to an account', `${s.name} → ${co.name}`);
        renderServiceDrawer(); renderView(); toast('Tagged to '+co.name);
      }catch(e){ toast('Could not tag — ' + (e.message || 'try again')); }
    }
    else if (co && !why.value.trim()){ toast('Add a short reason first'); }
  });
}

/* ============================================================
   COMPETITION DASHBOARD
   ============================================================ */
function competitorById(id){ return DATA.competitors.find(c=>c.id===id); }
function threatChipClass(threat){
  return threat==='Direct' ? 'chip-high' : threat==='Adjacent' ? 'chip-medium' : 'chip-low';
}
function campaignTypeChipClass(type){
  return type==='Current' ? 'chip-good' : type==='Future' ? 'chip-teal' : 'chip-low';
}
const VERDICT_OPTIONS = [
  {value:'compete', label:'We can compete directly', chip:'chip-good'},
  {value:'complement', label:'Complementary — position alongside them', chip:'chip-teal'},
  {value:'partner', label:'Potential partner / tech-transfer model', chip:'chip-gold'},
  {value:'avoid', label:'Cannot compete — avoid for now', chip:'chip-high'},
  {value:'watch', label:'Not active here yet — watch', chip:'chip-low'},
];
function verdictInfo(v){ return VERDICT_OPTIONS.find(o=>o.value===v) || VERDICT_OPTIONS[4]; }
function allCampaigns(){
  const rows = [];
  DATA.competitors.forEach(co=>co.campaigns.forEach(cp=>rows.push({...cp, competitor:co})));
  return rows;
}
function filteredCompetitors(){
  const q = ui.search.trim().toLowerCase();
  return DATA.competitors.filter(co=>{
    if (ui.competitorFilter.modality && co.modality!==ui.competitorFilter.modality) return false;
    if (ui.competitorFilter.threat && co.threat!==ui.competitorFilter.threat) return false;
    if (!q) return true;
    return co.name.toLowerCase().includes(q) || co.hq.toLowerCase().includes(q) || co.modality.toLowerCase().includes(q);
  });
}

function renderCompetitors(){
  const list = filteredCompetitors();
  const modalities = [...new Set(DATA.competitors.map(c=>c.modality))];
  const directCount = DATA.competitors.filter(c=>c.threat==='Direct').length;
  const recentCampaigns = allCampaigns().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  return `
    <div class="grid-tiles">
      <div class="card tile"><div class="n tabular">${DATA.competitors.length}</div><div class="l">Competitors tracked</div></div>
      <div class="card tile"><div class="n tabular" style="color:var(--critical)">${directCount}</div><div class="l">Direct overlap</div></div>
      <div class="card tile"><div class="n tabular">${allCampaigns().length}</div><div class="l">Campaigns logged</div></div>
      <div class="card tile"><div class="n tabular">${modalities.length}</div><div class="l">Modalities watched</div></div>
    </div>

    <div class="card panel">
      <h3>Most recent intel</h3>
      ${recentCampaigns.map(cp=>`
        <div class="needs-row" data-open-competitor="${cp.competitor.id}">
          <span class="chip ${campaignTypeChipClass(cp.type)}">${esc(cp.type)}</span>
          <span class="t"><b>${esc(cp.competitor.name)}</b> — ${esc(cp.title)}</span>
          <span class="d">${fmtDate(cp.date)}</span>
        </div>
      `).join('')}
    </div>

    <div class="toolbar">
      <select class="select" id="filterModality">
        <option value="">All modalities</option>
        ${modalities.map(m=>`<option value="${esc(m)}" ${ui.competitorFilter.modality===m?'selected':''}>${esc(m)}</option>`).join('')}
      </select>
      <select class="select" id="filterThreat">
        <option value="">All threat levels</option>
        ${['Direct','Adjacent','Watch'].map(t=>`<option value="${t}" ${ui.competitorFilter.threat===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <span style="margin-left:auto;font-size:11.5px;color:var(--muted)">${list.length} of ${DATA.competitors.length} competitors</span>
    </div>

    <div class="sol-grid">
      ${list.map(co=>{
        const latest = [...co.campaigns].sort((a,b)=>b.date.localeCompare(a.date))[0];
        return `
        <div class="card sol-card" data-open-competitor="${co.id}" style="cursor:pointer;">
          <div class="row" style="justify-content:space-between;margin-bottom:8px;">
            <span class="chip chip-teal">${esc(co.modality)}</span>
            <span class="chip ${threatChipClass(co.threat)}">${esc(co.threat)}</span>
          </div>
          <h3>${esc(co.name)}</h3>
          <p style="font-size:11.3px;color:var(--faint);margin-bottom:8px;">${esc(co.hq)}</p>
          <p>${esc(co.notes)}</p>
          ${latest ? `<div class="bullets"><div class="bullet solution" style="font-size:11.5px;padding:6px 8px;"><b>${esc(latest.type)}</b> · ${esc(latest.title)}</div></div>` : ''}
          <div class="adopters">${co.campaigns.length} campaign${co.campaigns.length===1?'':'s'} logged</div>
        </div>`;
      }).join('')}
      ${list.length===0?`<div class="empty">${ICONS.empty}<div>No competitors match.</div></div>`:''}
    </div>
  `;
}
function bindCompetitorsControls(){
  document.querySelectorAll('[data-open-competitor]').forEach(el=>el.addEventListener('click', ()=>openCompetitorDrawer(el.dataset.openCompetitor)));
  const fm = document.getElementById('filterModality');
  if (fm) fm.addEventListener('change', e=>{ ui.competitorFilter.modality=e.target.value; renderView(); });
  const ft = document.getElementById('filterThreat');
  if (ft) ft.addEventListener('change', e=>{ ui.competitorFilter.threat=e.target.value; renderView(); });
}

function renderCompetitorDrawer(){
  const co = competitorById(ui.drawerCompetitorId);
  const drawer = document.getElementById('drawer');
  if (!co){ drawer.innerHTML=''; return; }
  const campaigns = [...co.campaigns].sort((a,b)=>b.date.localeCompare(a.date));

  drawer.innerHTML = `
    <button class="drawer-close" id="drawerCloseBtn">${ICONS.x}</button>
    <div class="drawer-head">
      <div class="eyebrow">${esc(co.hq)}</div>
      <h2>${esc(co.name)}</h2>
      <div class="field-row">
        <select id="modalitySelect">${['Drone','ROV','Crawler','Multi-domain','Other'].map(m=>`<option value="${m}" ${co.modality===m?'selected':''}>${m}</option>`).join('')}</select>
        <select id="threatSelect">${['Direct','Adjacent','Watch'].map(t=>`<option value="${t}" ${co.threat===t?'selected':''}>${t} threat</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="deleteCompetitorBtn" style="color:#f3d9d6;border:1px solid var(--navy-line);">Remove</button>
      </div>
    </div>
    <div class="drawer-body">
      <div class="dsec">
        <div class="dsec-head"><h4>Profile</h4></div>
        <div class="add-inline"><input id="coName" value="${esc(co.name)}" placeholder="Competitor name"></div>
        <div class="add-inline"><input id="coHq" value="${esc(co.hq)}" placeholder="HQ / region"></div>
        <div class="add-inline"><input id="coWebsite" value="${esc(co.website||'')}" placeholder="Website — e.g. example.com"></div>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveIdentityBtn">Save details</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Notes</h4></div>
        <textarea class="notes-area" id="notesArea">${esc(co.notes||'')}</textarea>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveNotesBtn">Save notes</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Campaigns — past, current & future (${campaigns.length})</h4></div>
        ${campaigns.length===0 ? `<div class="empty" style="padding:16px;">${ICONS.empty}<div>Nothing logged yet.</div></div>` :
          campaigns.map(cp=>{ const v = verdictInfo(cp.verdict); return `
            <div class="rec-card">
              <div class="row" style="justify-content:space-between;gap:8px;">
                <div class="row" style="gap:6px;">
                  <span class="chip ${campaignTypeChipClass(cp.type)}">${esc(cp.type)}</span>
                  <span class="mono" style="font-size:10.5px;color:var(--muted);">${fmtDate(cp.date)}</span>
                </div>
                <button class="x" data-del-campaign="${cp.id}" style="background:none;border:none;color:var(--teal-strong);cursor:pointer;">${ICONS.x}</button>
              </div>
              <div class="rname" style="margin-top:6px;">${esc(cp.title)}</div>
              <div class="rwhy">${esc(cp.summary)}</div>
              <div class="row" style="justify-content:space-between;margin-top:6px;">
                <span class="chip chip-gold">${esc(cp.relevance||'Watch')}</span>
                ${cp.sourceUrl ? `<a href="https://${esc(stripProto(cp.sourceUrl))}" target="_blank" rel="noopener" class="src-link" style="font-size:10.8px;">Source ↗</a>` : ''}
              </div>
              ${cp.performance||cp.gap||cp.sweetSpot ? `
              <div class="campaign-analysis">
                ${cp.performance?`<div><b>Performance:</b> ${esc(cp.performance)}</div>`:''}
                ${cp.gap?`<div><b>Gap:</b> ${esc(cp.gap)}</div>`:''}
                ${cp.sweetSpot?`<div><b>Sweet spot for us:</b> ${esc(cp.sweetSpot)}</div>`:''}
              </div>` : ''}
              <span class="chip ${v.chip}" style="margin-top:8px;">${esc(v.label)}</span>
            </div>
          `;}).join('')}
        <div class="add-inline"><input id="cpTitle" placeholder="Campaign / activity title…"></div>
        <div class="add-inline">
          <select id="cpType">${['Past','Current','Future'].map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
          <input type="date" id="cpDate" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="add-inline">
          <select id="cpRelevance">
            <option value="Direct overlap">Direct overlap</option>
            <option value="Adjacent/whitespace">Adjacent / whitespace</option>
            <option value="Watch">Watch</option>
          </select>
        </div>
        <div class="add-inline"><input id="cpSource" placeholder="Source link (their site/social post)…"></div>
        <div class="add-inline"><textarea id="cpSummary" placeholder="What it means for Aerosub…"></textarea></div>
        <label class="eyebrow" style="display:block;margin:10px 0 4px;">Campaign analysis</label>
        <div class="add-inline"><textarea id="cpPerformance" placeholder="Performance — how is it going for them?"></textarea></div>
        <div class="add-inline"><textarea id="cpGap" placeholder="Gap — what's missing from their approach?"></textarea></div>
        <div class="add-inline"><textarea id="cpSweetSpot" placeholder="Sweet spot for us — where's the opening?"></textarea></div>
        <div class="add-inline">
          <select id="cpVerdict">${VERDICT_OPTIONS.map(o=>`<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select>
        </div>
        <div class="add-inline"><button class="btn btn-sm btn-primary" id="addCampaignBtn" style="width:100%;justify-content:center;">${ICONS.plus} Log campaign</button></div>
      </div>
    </div>
  `;
  bindCompetitorDrawer(co);
}
function bindCompetitorDrawer(co){
  document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
  document.getElementById('modalitySelect').addEventListener('change', async e=>{
    const modality = e.target.value;
    try{ await competitorsApi.setModality(co.id, modality); co.modality = modality; }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
    renderCompetitorDrawer(); renderView();
  });
  document.getElementById('threatSelect').addEventListener('change', async e=>{
    const threat = e.target.value;
    try{ await competitorsApi.setThreat(co.id, threat); co.threat = threat; }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
    renderCompetitorDrawer(); renderView();
  });
  document.getElementById('deleteCompetitorBtn').addEventListener('click', ()=>{
    openConfirmModal(`Remove ${co.name} and its logged campaigns?`, async ()=>{
      try{
        await competitorsApi.remove(co.id);
        DATA.competitors = DATA.competitors.filter(x=>x.id!==co.id);
        closeDrawer(); renderApp();
        toast('Competitor removed');
      }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
    });
  });

  document.getElementById('saveIdentityBtn').addEventListener('click', async ()=>{
    const name = document.getElementById('coName').value.trim();
    if (!name){ toast('Name required'); return; }
    const hq = document.getElementById('coHq').value.trim();
    const website = normalizeUrlish(document.getElementById('coWebsite').value);
    try{
      await competitorsApi.editIdentity(co.id, {name, hq, website});
      co.name = name; co.hq = hq; co.website = website;
      toast('Details saved'); renderApp(); openCompetitorDrawer(co.id);
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });

  document.getElementById('saveNotesBtn').addEventListener('click', async ()=>{
    const notes = document.getElementById('notesArea').value;
    try{ await competitorsApi.setNotes(co.id, notes); co.notes = notes; toast('Notes saved'); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });

  document.querySelectorAll('[data-del-campaign]').forEach(b=>b.addEventListener('click', async ()=>{
    try{
      await competitorsApi.removeCampaign(b.dataset.delCampaign);
      co.campaigns = co.campaigns.filter(x=>x.id!==b.dataset.delCampaign);
      renderCompetitorDrawer(); renderView();
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));

  document.getElementById('addCampaignBtn').addEventListener('click', async ()=>{
    const title = document.getElementById('cpTitle').value.trim();
    if (!title){ toast('Title required'); return; }
    const campaign = {
      title,
      type: document.getElementById('cpType').value,
      date: document.getElementById('cpDate').value || new Date().toISOString().slice(0,10),
      relevance: document.getElementById('cpRelevance').value,
      sourceUrl: normalizeUrlish(document.getElementById('cpSource').value),
      summary: document.getElementById('cpSummary').value.trim(),
      performance: document.getElementById('cpPerformance').value.trim(),
      gap: document.getElementById('cpGap').value.trim(),
      sweetSpot: document.getElementById('cpSweetSpot').value.trim(),
      verdict: document.getElementById('cpVerdict').value,
    };
    const addBtn = document.getElementById('addCampaignBtn'); addBtn.disabled = true;
    try{
      const saved = await competitorsApi.createCampaign(co.id, campaign);
      co.campaigns.push(saved);
      logActivity('Logged a competitor campaign', `${co.name} — ${title}`);
      renderCompetitorDrawer(); renderView(); toast('Campaign logged');
    }catch(e){ toast('Could not log campaign — ' + (e.message || 'try again')); addBtn.disabled = false; }
  });
}

function openAddCompetitorModal(){
  openModal(`
    <h3>New competitor</h3>
    <div class="field"><label>Name</label><input id="mName"></div>
    <div class="field"><label>HQ / region</label><input id="mHq" placeholder="e.g. Lagos, Nigeria"></div>
    <div class="field"><label>Modality</label><select id="mModality">${['Drone','ROV','Crawler','Multi-domain','Other'].map(m=>`<option value="${m}">${m}</option>`).join('')}</select></div>
    <div class="field"><label>Threat level</label><select id="mThreat">${['Direct','Adjacent','Watch'].map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>
    <div class="field"><label>Website</label><input id="mWebsite" placeholder="e.g. example.com"></div>
    <div class="field"><label>Notes</label><textarea id="mNotes" placeholder="Positioning, pricing tier, what to watch for…"></textarea></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add competitor</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const competitor = {
        id: crypto.randomUUID(), name, hq: body.querySelector('#mHq').value.trim()||'Unknown',
        modality: body.querySelector('#mModality').value, threat: body.querySelector('#mThreat').value,
        website: normalizeUrlish(body.querySelector('#mWebsite').value), notes: body.querySelector('#mNotes').value.trim(),
      };
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await competitorsApi.create(competitor);
        DATA.competitors.push(saved);
        closeModal(); renderApp(); toast('Competitor added');
      }catch(e){ toast('Could not add competitor — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

/* ============================================================
   RESEARCH TAB (clips saved manually or via the Chrome extension)
   ============================================================ */
function filteredResearch(){
  const q = ui.search.trim().toLowerCase();
  const rows = [...DATA.research].sort((a,b)=>(b.capturedAt||'').localeCompare(a.capturedAt||''));
  if (!q) return rows;
  return rows.filter(r=>
    r.title.toLowerCase().includes(q) || (r.summary||'').toLowerCase().includes(q) ||
    (r.potential||'').toLowerCase().includes(q) || (r.contactName||'').toLowerCase().includes(q)
  );
}
function renderResearch(){
  const rows = filteredResearch();
  return `
    <div class="card panel" style="margin-bottom:16px;">
      <p style="font-size:11.5px;color:var(--muted);line-height:1.55;">
        Clips you save from other websites — manually, or via the Aerosub Research Chrome extension (see the <b>chrome-extension</b> folder next to this app).
        Capture the page, jot what it means for Aerosub and any contact details, then optionally link it to an account or promote the contact straight into that account's contact list.
      </p>
    </div>
    <div class="sol-grid">
      ${rows.map(r=>{
        const co = r.companyId ? companyById(r.companyId) : null;
        return `
        <div class="card sol-card">
          <div class="row" style="justify-content:space-between;margin-bottom:8px;">
            <span class="chip chip-teal">${fmtDate((r.capturedAt||'').slice(0,10))}</span>
            <button class="x" data-del-research="${r.id}" style="background:none;border:none;color:var(--faint);cursor:pointer;">${ICONS.x}</button>
          </div>
          <h3>${r.url?`<a href="https://${esc(stripProto(r.url))}" target="_blank" rel="noopener" style="color:var(--ink);text-decoration:none;">${esc(r.title)}</a>`:esc(r.title)}</h3>
          ${r.summary?`<p><b>Summary:</b> ${esc(r.summary)}</p>`:''}
          ${r.potential?`<p><b>Potential for Aerosub:</b> ${esc(r.potential)}</p>`:''}
          ${(r.contactName||r.contactEmail||r.contactPhone||r.contactLinkedin) ? `
            <div class="bullets" style="margin-bottom:10px;">
              <div class="bullet solution" style="font-size:11.5px;padding:8px 9px;">
                ${r.contactName?`<div><b>${esc(r.contactName)}</b></div>`:''}
                ${r.contactEmail?`<div>${ICONS.mail} ${esc(r.contactEmail)}</div>`:''}
                ${r.contactPhone?`<div>${ICONS.phone} ${esc(r.contactPhone)}</div>`:''}
                ${r.contactLinkedin?`<div><a href="https://${esc(stripProto(r.contactLinkedin))}" target="_blank" rel="noopener">${ICONS.linkedin} Profile</a></div>`:''}
              </div>
            </div>` : ''}
          <div class="add-inline" style="margin-bottom:6px;">
            <select data-link-company="${r.id}">
              <option value="">Not linked to an account</option>
              ${DATA.companies.map(c=>`<option value="${c.id}" ${r.companyId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          ${r.contactName && co ? `<button class="btn btn-sm" data-promote-contact="${r.id}" style="width:100%;justify-content:center;">${ICONS.plus} Add ${esc(r.contactName)} to ${esc(co.name)}</button>` : ''}
        </div>`;
      }).join('')}
      ${rows.length===0?`<div class="empty">${ICONS.empty}<div>No clips saved yet.</div></div>`:''}
    </div>
    ${(!researchEnd && DATA.research.length >= store.RESEARCH_PAGE) ? `
      <div style="text-align:center;margin-top:14px;">
        <button class="btn btn-ghost" id="loadMoreResearchBtn">Load older clips</button>
      </div>` : ''}
  `;
}
function bindResearchControls(){
  document.querySelectorAll('[data-del-research]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = b.dataset.delResearch;
    try{
      await researchApi.remove(id);
      DATA.research = DATA.research.filter(x=>x.id!==id);
      renderView(); toast('Clip removed');
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-link-company]').forEach(sel=>sel.addEventListener('change', async e=>{
    const r = DATA.research.find(x=>x.id===sel.dataset.linkCompany);
    if (!r) return;
    const companyId = e.target.value;
    try{ await researchApi.linkCompany(r.id, companyId); r.companyId = companyId; renderView(); }
    catch(err){ toast('Could not link — ' + (err.message || 'try again')); renderView(); }
  }));
  const loadMoreBtn = document.getElementById('loadMoreResearchBtn');
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', async ()=>{
    loadMoreBtn.disabled = true;
    const oldest = DATA.research.reduce((m, r) => (!m || (r.capturedAt || '') < m) ? (r.capturedAt || '') : m, '');
    try{
      const { clips, end } = await store.loadMoreResearch(oldest);
      const have = new Set(DATA.research.map(r => r.id));
      DATA.research.push(...clips.filter(c => !have.has(c.id)));
      researchEnd = end;
      renderView();
    }catch(e){ toast('Could not load more — ' + (e.message || 'try again')); loadMoreBtn.disabled = false; }
  });
  document.querySelectorAll('[data-promote-contact]').forEach(b=>b.addEventListener('click', async ()=>{
    const r = DATA.research.find(x=>x.id===b.dataset.promoteContact);
    const co = r && companyById(r.companyId);
    if (!r || !co) return;
    const ct = {
      id: crypto.randomUUID(), name: r.contactName, pos: 'From research clip',
      email: r.contactEmail || '', phone: r.contactPhone || '', linkedin: normalizeLinkedin(r.contactLinkedin),
      verified: false, lastContact: '', nextFollowUp: '',
    };
    try{
      const saved = await contactsApi.create(co.id, ct);
      co.contacts.push(saved);
      renderApp(); toast(`Added ${r.contactName} to ${co.name}`);
    }catch(e){ toast('Could not add contact — ' + (e.message || 'try again')); }
  }));
}
function openAddResearchModal(){
  const companyOptions = '<option value="">Not linked to an account</option>' + DATA.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  openModal(`
    <h3>New research clip</h3>
    <div class="field"><label>Page title</label><input id="mTitle"></div>
    <div class="field"><label>URL</label><input id="mUrl" placeholder="example.com/article"></div>
    <div class="field"><label>Brief summary</label><textarea id="mSummary" placeholder="What is this page/post about?"></textarea></div>
    <div class="field"><label>Potential for Aerosub</label><textarea id="mPotential" placeholder="Why this matters — opportunity, risk, competitor move…"></textarea></div>
    <div class="field"><label>Contact name (optional)</label><input id="mCName"></div>
    <div class="field"><label>Contact email</label><input id="mCEmail"></div>
    <div class="field"><label>Contact phone</label><input id="mCPhone"></div>
    <div class="field"><label>Contact LinkedIn</label><input id="mCLinkedin" placeholder="linkedin.com/in/…"></div>
    <div class="field"><label>Link to account</label><select id="mCo">${companyOptions}</select></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Save clip</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const title = body.querySelector('#mTitle').value.trim();
      if (!title){ toast('Title required'); return; }
      const email = body.querySelector('#mCEmail').value.trim();
      const { ok, errors } = validateChanged({contactEmail:''}, {contactEmail: email}, {contactEmail: emailRule});
      if (!ok){ toast(errors.contactEmail); return; }
      const clip = {
        title, url: normalizeUrlish(body.querySelector('#mUrl').value),
        capturedAt: new Date().toISOString(),
        summary: body.querySelector('#mSummary').value.trim(), potential: body.querySelector('#mPotential').value.trim(),
        contactName: body.querySelector('#mCName').value.trim(), contactEmail: email,
        contactPhone: body.querySelector('#mCPhone').value.trim(), contactLinkedin: normalizeUrlish(body.querySelector('#mCLinkedin').value),
        companyId: body.querySelector('#mCo').value,
      };
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await researchApi.create(clip, AUTH.profile && AUTH.profile.id);
        DATA.research.unshift(saved);
        closeModal(); renderApp(); toast('Clip saved');
      }catch(e){ toast('Could not save — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}
function doImportResearch(e){
  const file = e.target.files[0];
  if (!file) return;
  const input = e.target;
  const reader = new FileReader();
  reader.onload = async () => {
    let clips;
    try{
      const parsed = JSON.parse(reader.result);
      clips = Array.isArray(parsed) ? parsed : Array.isArray(parsed.clips) ? parsed.clips : null;
      if (!clips) throw new Error('bad shape');
    }catch(err){
      toast('Could not read that file — expecting clips exported from the Aerosub Research extension');
      input.value = ''; return;
    }
    try{
      const saved = await researchApi.importClips(clips, AUTH.profile && AUTH.profile.id);
      const have = new Set(DATA.research.map(r => r.id));
      DATA.research.unshift(...saved.filter(c => !have.has(c.id)));
      DATA.research.sort((a,b)=>(b.capturedAt||'').localeCompare(a.capturedAt||''));
      renderApp();
      toast(saved.length ? `Imported ${saved.length} clip${saved.length===1?'':'s'}` : 'No valid clips found in that file');
    }catch(err){ toast('Could not import — ' + (err.message || 'try again')); }
    input.value = '';
  };
  reader.readAsText(file);
}

/* ============================================================
   REPORT BUILDER — a branded, Word-openable .html (with a locked-down CSP
   <meta> so an injected string can't execute or exfiltrate when the file
   is opened) plus a plain .md. Preview renders in a fully-sandboxed iframe
   via srcdoc. Export is a plain Blob + <a download> (D-6).
   ============================================================ */
const REPORT_SECTIONS = [
  ['profile','Company Profile'],
  ['pain','Pain Points & Challenges'],
  ['current','Current Solutions in Place'],
  ['recommended','Recommended Products & Offers'],
  ['contacts','Key Contacts'],
  ['notes','Notes'],
];

function buildReportHtml(co, sections){
  const dateStr = new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'long', year:'numeric'});
  const recs = co.recommended.map(r=>{ const s=solutionById(r.sol); return s?{name:s.name, tag:s.tag, why:r.why}:null; }).filter(Boolean);
  const contactRows = co.contacts.map(ct=>`
    <tr>
      <td>${esc(ct.name)}</td><td>${esc(ct.pos)}</td>
      <td>${ct.email?esc(ct.email):'—'}</td><td>${ct.phone?esc(ct.phone):'—'}</td>
      <td>${ct.linkedin?esc(ct.linkedin):'—'}</td>
    </tr>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${esc(co.name)} — Aerosub Account Briefing</title>
<style>
  body{font-family:'Inter',Arial,sans-serif;color:${BRAND.ink};margin:0;background:#fff;}
  .letterhead{background:${BRAND.navy};padding:26px 40px;}
  .letterhead img{height:32px;display:block;}
  .letterhead .meta{color:#c9d6f5;font-size:10.5px;margin-top:12px;letter-spacing:.03em;}
  .body-pad{padding:32px 42px 56px;max-width:760px;}
  h1{font-size:23px;margin:0 0 4px;color:${BRAND.navy};}
  .subtitle{font-size:12.5px;color:#5a6472;margin-bottom:18px;}
  .tagline{display:inline-block;background:${BRAND.mist};color:${BRAND.navy};font-size:10.5px;font-weight:700;letter-spacing:.03em;padding:5px 12px;border-radius:99px;margin-bottom:26px;}
  h2{font-size:13.5px;color:${BRAND.navy};border-bottom:2px solid ${BRAND.blue};padding-bottom:6px;margin:26px 0 12px;}
  p{font-size:12.3px;line-height:1.65;}
  ul{margin:0;padding-left:18px;}
  li{font-size:12.3px;line-height:1.7;margin-bottom:5px;}
  .rec{border-left:3px solid ${BRAND.blue};background:${BRAND.mist};padding:10px 14px;margin-bottom:10px;border-radius:0 6px 6px 0;}
  .rec b{color:${BRAND.navy};}
  table{width:100%;border-collapse:collapse;font-size:11.3px;}
  th{text-align:left;background:${BRAND.navy};color:#fff;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;}
  td{padding:7px 10px;border-bottom:1px solid #e5e9f2;}
  .footer{margin-top:36px;padding-top:14px;border-top:1px solid #e5e9f2;font-size:10px;color:#8b96a5;line-height:1.6;}
  .footer b{color:${BRAND.navy};}
</style></head>
<body>
  <div class="letterhead">
    <img src="${BRAND.logoDataUri}" alt="Aerosub">
    <div class="meta">${esc(BRAND.site)} &nbsp;·&nbsp; Inspection Intelligence for Oil &amp; Gas Assets &nbsp;·&nbsp; ${dateStr}</div>
  </div>
  <div class="body-pad">
    <h1>${esc(co.name)}</h1>
    <div class="subtitle">${esc(co.type)} — Strategic Account Briefing</div>
    <div class="tagline">${esc(BRAND.tagline)}</div>

    ${sections.profile ? `<h2>Company Profile</h2><p>${esc(co.summary)}</p>` : ''}
    ${sections.pain && co.painPoints.length ? `<h2>Pain Points &amp; Inspection Challenges</h2><ul>${co.painPoints.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${sections.current && co.currentSolutions.length ? `<h2>Current Solutions In Place</h2><ul>${co.currentSolutions.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${sections.recommended && recs.length ? `<h2>Aerosub Products &amp; Offers Recommended</h2>${recs.map(r=>`<div class="rec"><b>${esc(r.name)}</b> <span style="color:#8b96a5;">(${esc(r.tag)})</span><br>${esc(r.why)}</div>`).join('')}` : ''}
    ${sections.contacts && co.contacts.length ? `<h2>Key Contacts</h2><table><tr><th>Name</th><th>Position</th><th>Email</th><th>Phone</th><th>LinkedIn</th></tr>${contactRows}</table>` : ''}
    ${sections.notes && co.notes ? `<h2>Notes</h2><p>${esc(co.notes)}</p>` : ''}

    <div class="footer">
      <b>Aerosub Solutions</b> &nbsp;·&nbsp; ${esc(BRAND.positioning)}<br>
      Prepared via the Aerosub Pipeline tool on ${dateStr}. Confidential — for internal and prospective-client discussion use.
    </div>
  </div>
</body></html>`;
}

function buildReportMarkdown(co, sections){
  const dateStr = new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'long', year:'numeric'});
  const recs = co.recommended.map(r=>{ const s=solutionById(r.sol); return s?{name:s.name, tag:s.tag, why:r.why}:null; }).filter(Boolean);
  let md = `AEROSUB SOLUTIONS\n*${BRAND.tagline}*\n\n# ${co.name}\n${co.type} — Strategic Account Briefing\nPrepared ${dateStr}\n\n`;
  if (sections.profile) md += `## Company Profile\n${co.summary}\n\n`;
  if (sections.pain && co.painPoints.length) md += `## Pain Points & Inspection Challenges\n` + co.painPoints.map(p=>`- ${p}`).join('\n') + '\n\n';
  if (sections.current && co.currentSolutions.length) md += `## Current Solutions In Place\n` + co.currentSolutions.map(p=>`- ${p}`).join('\n') + '\n\n';
  if (sections.recommended && recs.length) md += `## Aerosub Products & Offers Recommended\n` + recs.map(r=>`**${r.name}** (${r.tag})\n${r.why}\n`).join('\n') + '\n';
  if (sections.contacts && co.contacts.length){
    md += `## Key Contacts\n| Name | Position | Email | Phone | LinkedIn |\n|---|---|---|---|---|\n`;
    md += co.contacts.map(ct=>`| ${ct.name} | ${ct.pos} | ${ct.email||'—'} | ${ct.phone||'—'} | ${ct.linkedin||'—'} |`).join('\n') + '\n\n';
  }
  if (sections.notes && co.notes) md += `## Notes\n${co.notes}\n\n`;
  md += `---\n${BRAND.positioning}\n\nPrepared via the Aerosub Pipeline tool · ${BRAND.site} · Confidential\n`;
  return md;
}

function renderReports(){
  if (DATA.companies.length===0) return `<div class="empty">${ICONS.empty}<div>Add an account first to build a report.</div></div>`;
  if (!ui.reportCompanyId || !companyById(ui.reportCompanyId)) ui.reportCompanyId = DATA.companies[0].id;
  return `
    <div class="report-layout">
      <div class="card report-controls" style="padding:16px;">
        <h3>Account</h3>
        <select id="reportCoSelect">${DATA.companies.map(c=>`<option value="${c.id}" ${c.id===ui.reportCompanyId?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
        <h3>Sections</h3>
        ${REPORT_SECTIONS.map(([key,label])=>`
          <label class="check-row"><input type="checkbox" data-section="${key}" ${ui.reportSections[key]?'checked':''}> ${label}</label>
        `).join('')}
        <button class="btn btn-primary" id="exportHtmlBtn" style="width:100%;justify-content:center;margin-top:10px;">${ICONS.download} Export as .html</button>
        <button class="btn" id="exportMdBtn" style="width:100%;justify-content:center;margin-top:8px;">${ICONS.download} Export as .md (plain)</button>
        <div class="report-note">The .html file opens directly in Word with full Aerosub branding. .md is a plain-text fallback that always works.</div>
      </div>
      <div class="report-preview-wrap">
        <iframe id="reportPreview" title="Report preview" sandbox referrerpolicy="no-referrer"></iframe>
      </div>
    </div>
  `;
}
function updateReportPreview(){
  const co = companyById(ui.reportCompanyId);
  const frame = document.getElementById('reportPreview');
  if (frame && co) frame.srcdoc = buildReportHtml(co, ui.reportSections);
}
function bindReportsControls(){
  const sel = document.getElementById('reportCoSelect');
  if (sel) sel.addEventListener('change', e=>{ ui.reportCompanyId = e.target.value; renderView(); });
  document.querySelectorAll('[data-section]').forEach(cb=>cb.addEventListener('change', e=>{
    ui.reportSections[cb.dataset.section] = e.target.checked; renderView();
  }));
  const exportHtmlBtn = document.getElementById('exportHtmlBtn');
  if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', doExportReportHtml);
  const exportMdBtn = document.getElementById('exportMdBtn');
  if (exportMdBtn) exportMdBtn.addEventListener('click', doExportReportMd);
  updateReportPreview();
}

function doExportReportHtml(){
  const co = companyById(ui.reportCompanyId);
  if (!co) return;
  downloadFile(`Aerosub - ${co.name} Report - ${new Date().toISOString().slice(0,10)}.html`,
    buildReportHtml(co, ui.reportSections), 'text/html');
}
function doExportReportMd(){
  const co = companyById(ui.reportCompanyId);
  if (!co) return;
  downloadFile(`Aerosub - ${co.name} Report - ${new Date().toISOString().slice(0,10)}.md`,
    buildReportMarkdown(co, ui.reportSections), 'text/markdown');
}

/* ============================================================
   EVENTS
   ============================================================ */
function eventById(id){ return DATA.events.find(e=>e.id===id); }
function filteredEvents(){
  const q = ui.search.trim().toLowerCase();
  const rows = [...DATA.events].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  if (!q) return rows;
  return rows.filter(e=> e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q) || e.organizer.toLowerCase().includes(q));
}
function renderEvents(){
  const list = filteredEvents();
  const upcoming = DATA.events.filter(e=>!isOverdue(e.endDate));
  return `
    <div class="grid-tiles">
      <div class="card tile"><div class="n tabular">${DATA.events.length}</div><div class="l">Events tracked</div></div>
      <div class="card tile"><div class="n tabular">${upcoming.length}</div><div class="l">Upcoming</div></div>
    </div>
    <div class="sol-grid">
      ${list.map(eventCard).join('')}
      ${list.length===0?`<div class="empty">${ICONS.empty}<div>No events match.</div></div>`:''}
    </div>
  `;
}
function eventCard(ev){
  const past = isOverdue(ev.endDate);
  return `
    <div class="card sol-card" data-open-event="${ev.id}" style="cursor:pointer;${past?'opacity:.62;':''}">
      <div class="row" style="justify-content:space-between;margin-bottom:8px;">
        <span class="chip chip-teal">${fmtDate(ev.startDate)} – ${fmtDate(ev.endDate)}</span>
        <span class="chip ${past?'chip-low':'chip-good'}">${past?'Past':'Upcoming'}</span>
      </div>
      <h3>${esc(ev.name)}</h3>
      <p style="font-size:11.3px;color:var(--faint);margin-bottom:8px;">${esc(ev.organizer)} · ${esc(ev.location)}</p>
      <p>${esc(ev.benefits[0]||'')}</p>
      <div class="adopters">${ev.attendees.length} attendee note${ev.attendees.length===1?'':'s'} · ${esc((ev.cost||'').split('(')[0].trim())}</div>
    </div>
  `;
}
function bindEventsControls(){
  document.querySelectorAll('[data-open-event]').forEach(el=>el.addEventListener('click', ()=>openEventDrawer(el.dataset.openEvent)));
}

function renderEventDrawer(){
  const ev = eventById(ui.drawerEventId);
  const drawer = document.getElementById('drawer');
  if (!ev){ drawer.innerHTML=''; return; }
  drawer.innerHTML = `
    <button class="drawer-close" id="drawerCloseBtn">${ICONS.x}</button>
    <div class="drawer-head">
      <div class="eyebrow">${esc(ev.organizer)}</div>
      <h2>${esc(ev.name)}</h2>
      <div class="field-row">
        <span class="chip chip-teal" style="padding:5px 10px;">${fmtDate(ev.startDate)} – ${fmtDate(ev.endDate)}</span>
        <button class="btn btn-sm btn-ghost" id="deleteEventBtn" style="color:#f3d9d6;border:1px solid var(--navy-line);">Remove event</button>
      </div>
    </div>
    <div class="drawer-body">
      <div class="dsec">
        <div class="dsec-head"><h4>Details</h4></div>
        <div class="add-inline"><input id="evName" value="${esc(ev.name)}" placeholder="Event name"></div>
        <div class="add-inline"><input id="evOrganizer" value="${esc(ev.organizer)}" placeholder="Organizer"></div>
        <div class="add-inline"><input id="evLocation" value="${esc(ev.location)}" placeholder="Location"></div>
        <div class="add-inline">
          <input type="date" id="evStart" value="${ev.startDate}">
          <input type="date" id="evEnd" value="${ev.endDate}">
        </div>
        <div class="add-inline"><input id="evCost" value="${esc(ev.cost)}" placeholder="Cost ($$) — can be a range/estimate"></div>
        <div class="add-inline"><input id="evWebsite" value="${esc(ev.website||'')}" placeholder="Website"></div>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveEventDetailsBtn">Save details</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Core benefits</h4></div>
        <div class="bullets" id="evBenefits">
          ${ev.benefits.map((b,i)=>`<div class="bullet solution"><span>${esc(b)}</span><button class="x" data-del-benefit="${i}">${ICONS.x}</button></div>`).join('')}
        </div>
        <div class="add-inline"><input id="newBenefit" placeholder="Add a benefit…"><button class="btn btn-sm" id="addBenefitBtn">${ICONS.plus}</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Attending / could attend (${ev.attendees.length})</h4></div>
        ${ev.attendees.length===0?`<div class="empty" style="padding:12px;">${ICONS.empty}<div>No attendee notes yet.</div></div>`:
          ev.attendees.map((a,i)=>`
            <div class="bullet solution" style="align-items:center;">
              <span style="flex:1;">${esc(a.name)}${a.companyId&&companyById(a.companyId)?` <span class="chip chip-teal" style="margin-left:4px;">${esc(companyById(a.companyId).name)}</span>`:''} — <span style="color:var(--muted);">${esc(a.status)}</span></span>
              <button class="x" data-del-attendee="${a.id}">${ICONS.x}</button>
            </div>
          `).join('')}
        <div class="add-inline"><input id="newAttName" placeholder="Person or organisation…"></div>
        <div class="add-inline">
          <select id="newAttCo"><option value="">Not linked to an account</option>${DATA.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        </div>
        <div class="add-inline">
          <select id="newAttStatus">
            <option value="Considering">Considering</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Invited">Invited</option>
            <option value="Typically attends">Typically attends</option>
          </select>
          <button class="btn btn-sm" id="addAttendeeBtn">${ICONS.plus} Add</button>
        </div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Notes</h4></div>
        <textarea class="notes-area" id="evNotes">${esc(ev.notes||'')}</textarea>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveEventNotesBtn">Save notes</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Report</h4></div>
        <button class="btn btn-primary" id="exportEventHtmlBtn" style="width:100%;justify-content:center;">${ICONS.download} Export event brief (.html)</button>
        <button class="btn" id="exportEventMdBtn" style="width:100%;justify-content:center;margin-top:8px;">${ICONS.download} Export as .md (plain)</button>
      </div>
    </div>
  `;
  bindEventDrawer(ev);
}
function bindEventDrawer(ev){
  document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
  document.getElementById('deleteEventBtn').addEventListener('click', ()=>{
    openConfirmModal(`Remove ${ev.name}?`, async ()=>{
      try{
        await eventsApi.remove(ev.id);
        DATA.events = DATA.events.filter(x=>x.id!==ev.id);
        closeDrawer(); renderApp();
        toast('Event removed');
      }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
    });
  });
  document.getElementById('saveEventDetailsBtn').addEventListener('click', async ()=>{
    const name = document.getElementById('evName').value.trim();
    if (!name){ toast('Name required'); return; }
    const patch = {
      name,
      organizer: document.getElementById('evOrganizer').value.trim(),
      location: document.getElementById('evLocation').value.trim(),
      startDate: document.getElementById('evStart').value || ev.startDate,
      endDate: document.getElementById('evEnd').value || ev.endDate,
      cost: document.getElementById('evCost').value.trim(),
      website: normalizeUrlish(document.getElementById('evWebsite').value),
    };
    try{
      await eventsApi.editDetails(ev.id, patch);
      Object.assign(ev, patch);
      renderView(); renderEventDrawer(); toast('Event details saved');
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  document.getElementById('addBenefitBtn').addEventListener('click', async ()=>{
    const inp = document.getElementById('newBenefit');
    const v = inp.value.trim();
    if (!v) return;
    const next = [...ev.benefits, v];
    try{ await eventsApi.setBenefits(ev.id, next); ev.benefits = next; renderEventDrawer(); }
    catch(e){ toast('Could not add — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-benefit]').forEach(b=>b.addEventListener('click', async ()=>{
    const next = ev.benefits.filter((_,i)=>i!==+b.dataset.delBenefit);
    try{ await eventsApi.setBenefits(ev.id, next); ev.benefits = next; renderEventDrawer(); }
    catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));
  document.getElementById('addAttendeeBtn').addEventListener('click', async ()=>{
    const name = document.getElementById('newAttName').value.trim();
    if (!name){ toast('Add a name first'); return; }
    const attendee = { name, companyId: document.getElementById('newAttCo').value, status: document.getElementById('newAttStatus').value };
    try{
      const saved = await eventsApi.addAttendee(ev.id, attendee);
      ev.attendees.push(saved);
      renderEventDrawer();
    }catch(e){ toast('Could not add — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-del-attendee]').forEach(b=>b.addEventListener('click', async ()=>{
    try{
      await eventsApi.removeAttendee(b.dataset.delAttendee);
      ev.attendees = ev.attendees.filter(a=>a.id!==b.dataset.delAttendee);
      renderEventDrawer();
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));
  document.getElementById('saveEventNotesBtn').addEventListener('click', async ()=>{
    const notes = document.getElementById('evNotes').value;
    try{ await eventsApi.setNotes(ev.id, notes); ev.notes = notes; toast('Notes saved'); }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });
  document.getElementById('exportEventHtmlBtn').addEventListener('click', ()=>doExportEventHtml(ev.id));
  document.getElementById('exportEventMdBtn').addEventListener('click', ()=>doExportEventMd(ev.id));
}
function openEventDrawer(id){
  ui.drawerKind = 'event';
  ui.drawerEventId = id;
  ui.drawerCompanyId = null; ui.drawerProductId = null; ui.drawerCompetitorId = null;
  document.getElementById('scrim').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  document.getElementById('scrim').onclick = closeDrawer;
  renderEventDrawer();
}
function openAddEventModal(){
  openModal(`
    <h3>New event</h3>
    <div class="field"><label>Name</label><input id="mName"></div>
    <div class="field"><label>Organizer</label><input id="mOrganizer"></div>
    <div class="field"><label>Location</label><input id="mLocation"></div>
    <div class="field"><label>Start date</label><input type="date" id="mStart"></div>
    <div class="field"><label>End date</label><input type="date" id="mEnd"></div>
    <div class="field"><label>Cost ($$)</label><input id="mCost" placeholder="e.g. ~$1,500 delegate pass (approx.)"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add event</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const start = body.querySelector('#mStart').value || new Date().toISOString().slice(0,10);
      const event = {
        id: crypto.randomUUID(), name,
        organizer: body.querySelector('#mOrganizer').value.trim(),
        location: body.querySelector('#mLocation').value.trim(),
        startDate: start,
        endDate: body.querySelector('#mEnd').value || start,
        cost: body.querySelector('#mCost').value.trim(), currency:'USD', website:'',
        benefits:[], attendees:[], notes:''
      };
      const saveBtn = body.querySelector('#mSave'); saveBtn.disabled = true;
      try{
        const saved = await eventsApi.create(event);
        DATA.events.push(saved);
        closeModal(); renderApp(); logActivity('Added an event', name); toast('Event added');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); saveBtn.disabled = false; }
    };
  });
}

function buildEventReportHtml(ev){
  const dateStr = new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'long', year:'numeric'});
  const attendeeRows = ev.attendees.map(a=>`<tr><td>${esc(a.name)}</td><td>${a.companyId&&companyById(a.companyId)?esc(companyById(a.companyId).name):'—'}</td><td>${esc(a.status)}</td></tr>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${esc(ev.name)} — Aerosub Event Brief</title>
<style>
  body{font-family:'Inter',Arial,sans-serif;color:${BRAND.ink};margin:0;background:#fff;}
  .letterhead{background:${BRAND.navy};padding:26px 40px;}
  .letterhead img{height:32px;display:block;}
  .letterhead .meta{color:#c9d6f5;font-size:10.5px;margin-top:12px;letter-spacing:.03em;}
  .body-pad{padding:32px 42px 56px;max-width:760px;}
  h1{font-size:23px;margin:0 0 4px;color:${BRAND.navy};}
  .subtitle{font-size:12.5px;color:#5a6472;margin-bottom:18px;}
  .tagline{display:inline-block;background:${BRAND.mist};color:${BRAND.navy};font-size:10.5px;font-weight:700;letter-spacing:.03em;padding:5px 12px;border-radius:99px;margin-bottom:26px;}
  h2{font-size:13.5px;color:${BRAND.navy};border-bottom:2px solid ${BRAND.blue};padding-bottom:6px;margin:26px 0 12px;}
  p{font-size:12.3px;line-height:1.65;}
  ul{margin:0;padding-left:18px;}
  li{font-size:12.3px;line-height:1.7;margin-bottom:5px;}
  table{width:100%;border-collapse:collapse;font-size:11.3px;}
  th{text-align:left;background:${BRAND.navy};color:#fff;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;}
  td{padding:7px 10px;border-bottom:1px solid #e5e9f2;}
  .footer{margin-top:36px;padding-top:14px;border-top:1px solid #e5e9f2;font-size:10px;color:#8b96a5;line-height:1.6;}
</style></head>
<body>
  <div class="letterhead">
    <img src="${BRAND.logoDataUri}" alt="Aerosub">
    <div class="meta">${esc(BRAND.site)} &nbsp;·&nbsp; Event Brief &nbsp;·&nbsp; ${dateStr}</div>
  </div>
  <div class="body-pad">
    <h1>${esc(ev.name)}</h1>
    <div class="subtitle">${esc(ev.organizer)} — ${esc(ev.location)} — ${fmtDate(ev.startDate)} to ${fmtDate(ev.endDate)}</div>
    <div class="tagline">Cost: ${esc(ev.cost||'Not yet estimated')}</div>
    <h2>Why this event benefits Aerosub</h2>
    <ul>${ev.benefits.map(b=>`<li>${esc(b)}</li>`).join('') || '<li>Not yet documented.</li>'}</ul>
    <h2>Attending / could attend</h2>
    ${ev.attendees.length ? `<table><tr><th>Who</th><th>Account</th><th>Status</th></tr>${attendeeRows}</table>` : '<p>Not yet documented.</p>'}
    ${ev.notes ? `<h2>Notes</h2><p>${esc(ev.notes)}</p>` : ''}
    <div class="footer"><b style="color:${BRAND.navy};">Aerosub Solutions</b> · Prepared via the Aerosub Pipeline tool on ${dateStr}. Confidential.</div>
  </div>
</body></html>`;
}
function buildEventReportMarkdown(ev){
  const dateStr = new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'long', year:'numeric'});
  let md = `AEROSUB SOLUTIONS — Event Brief\n\n# ${ev.name}\n${ev.organizer} — ${ev.location}\n${fmtDate(ev.startDate)} to ${fmtDate(ev.endDate)}\nCost: ${ev.cost||'Not yet estimated'}\nPrepared ${dateStr}\n\n`;
  md += `## Why this event benefits Aerosub\n` + (ev.benefits.map(b=>`- ${b}`).join('\n')||'Not yet documented.') + '\n\n';
  md += `## Attending / could attend\n`;
  md += ev.attendees.length ? ev.attendees.map(a=>`- ${a.name}${a.companyId&&companyById(a.companyId)?` (${companyById(a.companyId).name})`:''} — ${a.status}`).join('\n') : 'Not yet documented.';
  md += '\n\n';
  if (ev.notes) md += `## Notes\n${ev.notes}\n\n`;
  md += `---\nPrepared via the Aerosub Pipeline tool · ${BRAND.site} · Confidential\n`;
  return md;
}
function doExportEventHtml(id){
  const ev = eventById(id); if (!ev) return;
  downloadFile(`Aerosub - ${ev.name} Brief - ${new Date().toISOString().slice(0,10)}.html`,
    buildEventReportHtml(ev), 'text/html');
}
function doExportEventMd(id){
  const ev = eventById(id); if (!ev) return;
  downloadFile(`Aerosub - ${ev.name} Brief - ${new Date().toISOString().slice(0,10)}.md`,
    buildEventReportMarkdown(ev), 'text/markdown');
}

/* ============================================================
   SETTINGS — Your profile, Team, Invites, Connectors, Activity log
   Team + invites are real Supabase data (RLS: any member, PRD §7). The
   activity log is still browser-local in this task — HT11 moves it to
   Postgres. Connectors move in HT4.
   ============================================================ */
const DEPARTMENTS = ['Marketing','HR','Business Development','Engineering','MD','Other'];

// Attribution name for the activity log — the signed-in member's profile.
function currentUserName(){
  return (AUTH.profile && (AUTH.profile.full_name || AUTH.profile.email)) || '';
}
// Fire-and-forget audit line (PRD §6.17). Writes to Supabase via
// activityApi.log(), and also prepends a local copy so the Settings log
// updates instantly without a refetch — a lost line is acceptable for this
// append-only, non-tamper-evident log (D-2). Same signature as always, so
// the ~10 call sites don't change.
function logActivity(action, detail){
  const actorName = currentUserName() || 'Unattributed';
  const actorId = AUTH.profile && AUTH.profile.id;
  if (DATA && Array.isArray(DATA.activityLog)){
    DATA.activityLog.unshift({ id: crypto.randomUUID(), ts: new Date().toISOString(), user: actorName, action, detail: detail || '' });
    if (DATA.activityLog.length > 200) DATA.activityLog.length = 200;
  }
  activityApi.log(actorId, actorName, action, detail);
}

function renderSettings(){
  const me = AUTH.profile || {};
  const isAdmin = me.role === 'admin';
  const deptOpts = ['', ...DEPARTMENTS].map(d=>
    `<option value="${esc(d)}" ${(me.department||'')===d?'selected':''}>${d||'—'}</option>`).join('');
  const team = SETTINGS.profiles;
  const invites = SETTINGS.invites;
  const firstLoad = !SETTINGS.loaded;

  return `
    <div class="card panel">
      <h3>Your profile</h3>
      <div class="settings-note">
        Your name and department are how teammates and the activity log identify you.
        Your sign-in email (<b>${esc(me.email||'')}</b>) is fixed and can't be changed here.
      </div>
      <div class="field"><label>Full name</label><input id="profName" value="${esc(me.full_name||'')}" placeholder="e.g. Jane Doe"></div>
      <div class="field"><label>Department</label><select id="profDept">${deptOpts}</select></div>
      <label class="row" style="gap:6px;align-items:center;font-size:12px;margin:2px 0 12px;">
        <input type="checkbox" id="profAlerts" ${me.event_alerts_enabled!==false?'checked':''}>
        Notify me about events starting within ${EVENT_ALERT_WINDOW_DAYS} days (bell icon, top bar)
      </label>
      <button class="btn btn-primary btn-sm" id="saveProfileBtn">Save</button>
    </div>

    <div class="card panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin-bottom:0;">Team</h3>
        <button class="btn btn-sm btn-ghost" id="reloadTeamBtn">Refresh</button>
      </div>
      <p style="font-size:11px;color:var(--muted);margin-bottom:10px;">
        Everyone who has joined through an invite link. Almost everything stays open to every member — a small admin role only gates category management below (and, in a later phase, RFQ publishing/assignment).
      </p>
      ${firstLoad ? `<div class="empty" style="padding:14px;">Loading…</div>` : `
      <div class="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Joined</th>${isAdmin?'<th></th>':''}</tr></thead>
          <tbody>
            ${team.map(t=>`
              <tr>
                <td class="name-cell">${esc(t.full_name||'—')}${t.id===me.id?' <span class="sub">(you)</span>':''}</td>
                <td>${esc(t.email||'')}</td>
                <td>${t.department?`<span class="chip chip-teal">${esc(t.department)}</span>`:'<span class="sub">—</span>'}</td>
                <td>${t.role==='admin'?'<span class="chip chip-gold">Admin</span>':'<span class="sub">Member</span>'}</td>
                <td class="sub">${t.created_at?new Date(t.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):''}</td>
                ${isAdmin?`<td style="text-align:right;white-space:nowrap;">${t.id!==me.id?`<button class="btn btn-sm" data-toggle-role="${t.id}" data-next-role="${t.role==='admin'?'member':'admin'}">${t.role==='admin'?'Make member':'Make admin'}</button>`:''}</td>`:''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${team.length===0?`<div class="empty">${ICONS.empty}<div>No members yet.</div></div>`:''}`}
    </div>

    <div class="card panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin-bottom:0;">Product & service categories</h3>
      </div>
      <p style="font-size:11px;color:var(--muted);margin-bottom:10px;">
        The controlled list Store items (a later phase) will be tagged against — kept to what Aerosub actually offers.
        ${isAdmin?'':'Only admins can add, rename or remove categories.'}
      </p>
      <div class="row" style="gap:24px;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;">
          <h4 style="margin-bottom:8px;">Products</h4>
          ${DATA.settings.productCategories.map(cat=>`
            <div class="bullet solution" style="align-items:center;">
              <span style="flex:1;">${esc(cat.name)}</span>
              ${isAdmin?`<button class="btn btn-sm btn-ghost" data-rename-category="product:${cat.id}" data-cat-name="${esc(cat.name)}">Rename</button><button class="x" data-del-category="product:${cat.id}">${ICONS.x}</button>`:''}
            </div>`).join('')}
          ${DATA.settings.productCategories.length===0?`<div class="empty" style="padding:12px;">${ICONS.empty}<div>None yet.</div></div>`:''}
          ${isAdmin?`<div class="add-inline"><input id="newProductCat" placeholder="Add a product category…"><button class="btn btn-sm" id="addProductCatBtn">${ICONS.plus}</button></div>`:''}
        </div>
        <div style="flex:1;min-width:220px;">
          <h4 style="margin-bottom:8px;">Services</h4>
          ${DATA.settings.serviceCategories.map(cat=>`
            <div class="bullet solution" style="align-items:center;">
              <span style="flex:1;">${esc(cat.name)}</span>
              ${isAdmin?`<button class="btn btn-sm btn-ghost" data-rename-category="service:${cat.id}" data-cat-name="${esc(cat.name)}">Rename</button><button class="x" data-del-category="service:${cat.id}">${ICONS.x}</button>`:''}
            </div>`).join('')}
          ${DATA.settings.serviceCategories.length===0?`<div class="empty" style="padding:12px;">${ICONS.empty}<div>None yet.</div></div>`:''}
          ${isAdmin?`<div class="add-inline"><input id="newServiceCat" placeholder="Add a service category…"><button class="btn btn-sm" id="addServiceCatBtn">${ICONS.plus}</button></div>`:''}
        </div>
      </div>
    </div>

    <div class="card panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin-bottom:0;">Invites</h3>
        <button class="btn btn-sm btn-primary" id="newInviteBtn">${ICONS.plus} New invite</button>
      </div>
      <p style="font-size:11px;color:var(--muted);margin-bottom:10px;">
        Create a single-use link and send it to a new teammate however you like. They set their own name, email and password.
      </p>
      ${firstLoad ? `<div class="empty" style="padding:14px;">Loading…</div>` : `
      ${(()=>{ const active = invites.filter(inv=>invitesApi.inviteStatus(inv)==='active'); return `
      <div class="tablewrap">
        <table>
          <thead><tr><th>For</th><th>Status</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            ${active.map(inv=>`
              <tr>
                <td>${inv.email?esc(inv.email):'<span class="sub">anyone with the link</span>'}</td>
                <td><span class="chip chip-medium">active</span></td>
                <td class="sub">${new Date(inv.expires_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                <td style="white-space:nowrap;text-align:right;">
                  <button class="btn btn-sm" data-copy-invite="${esc(inv.token)}" data-invite-email="${esc(inv.email||'')}">Copy link</button>
                  <button class="btn btn-sm" data-revoke-invite="${esc(inv.id)}">Revoke</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${active.length===0?`<div class="empty">${ICONS.empty}<div>No invites yet.</div></div>`:''}`; })()}`}
    </div>

    <div class="card panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin-bottom:0;">Connectors & data sources</h3>
        <button class="btn btn-sm btn-primary" id="addConnectorBtn">${ICONS.plus} Add</button>
      </div>
      <p style="font-size:11px;color:var(--muted);margin-bottom:10px;">Reference list of external systems this team relies on — this tool has no live API integrations, so treat this as documentation, not a live connection.</p>
      ${DATA.settings.connectors.map(c=>`
        <div class="bullet solution" style="align-items:flex-start;">
          <span style="flex:1;"><b>${esc(c.name)}</b> — ${esc(c.type)}${c.url?` · ${esc(c.url)}`:''}<br><span style="color:var(--muted);font-size:11px;">${esc(c.notes)}</span></span>
          <button class="x" data-del-connector="${c.id}">${ICONS.x}</button>
        </div>
      `).join('')}
      ${DATA.settings.connectors.length===0?`<div class="empty" style="padding:14px;">${ICONS.empty}<div>None added yet.</div></div>`:''}
    </div>

    <div class="card panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin-bottom:0;">RSS feed sources</h3>
        ${isAdmin?`<button class="btn btn-sm btn-primary" id="addRssSourceBtn">${ICONS.plus} Add</button>`:''}
      </div>
      <p style="font-size:11px;color:var(--muted);margin-bottom:10px;">
        Polled every 6 hours by a scheduled server-side job and merged into the News feed as "live" items — the one place this tool talks to the outside world unattended, so adding a source is admin-only (PRD-v2 §8).
        ${isAdmin?'':' Only admins can add or remove sources.'}
      </p>
      ${DATA.settings.rssSources.map(s=>`
        <div class="bullet solution" style="align-items:flex-start;">
          <span style="flex:1;"><b>${esc(s.name)}</b>${s.category?` · ${esc(s.category)}`:''}<br><span style="color:var(--muted);font-size:11px;">${esc(s.url)}</span><br><span style="color:var(--faint);font-size:10.5px;">${s.lastPolledAt?`Last polled ${new Date(s.lastPolledAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Not polled yet'}</span></span>
          ${isAdmin?`<button class="x" data-del-rss-source="${s.id}">${ICONS.x}</button>`:''}
        </div>
      `).join('')}
      ${DATA.settings.rssSources.length===0?`<div class="empty" style="padding:14px;">${ICONS.empty}<div>No sources added yet.</div></div>`:''}
    </div>

    <div class="card panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin-bottom:0;">Activity log <span style="color:var(--faint);text-transform:none;letter-spacing:0;">— shared, newest first</span></h3>
        <button class="btn btn-sm btn-ghost" id="clearLogBtn">Clear log</button>
      </div>
      ${DATA.activityLog.length===0?`<div class="empty">${ICONS.empty}<div>No activity recorded yet.</div></div>`:
        DATA.activityLog.map(a=>`
          <div class="needs-row">
            <span class="t"><b>${esc(a.user)}</b> ${esc(a.action)}${a.detail?' — '+esc(a.detail):''}</span>
            <span class="d">${new Date(a.ts).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
          </div>
        `).join('')}
      ${(!activityEnd && DATA.activityLog.length >= store.ACTIVITY_PAGE) ? `
        <div style="text-align:center;margin-top:10px;">
          <button class="btn btn-sm btn-ghost" id="loadMoreActivityBtn">Load older entries</button>
        </div>` : ''}
    </div>
  `;
}

function loadSettingsData(){
  if (SETTINGS.loading) return;
  SETTINGS.loading = true;
  Promise.all([listProfiles(), invitesApi.list()])
    .then(([profiles, invites])=>{ SETTINGS.profiles = profiles; SETTINGS.invites = invites; SETTINGS.loaded = true; })
    .catch(()=>{ toast('Could not load team data'); })
    .finally(()=>{ SETTINGS.loading = false; if (ui.view==='settings') renderView(); });
}
function reloadSettingsData(){ SETTINGS.loaded = false; loadSettingsData(); }

function bindSettingsControls(){
  // Load once per visit, not on every render — loadSettingsData()'s own
  // completion re-renders this view (to fill in the fetched rows), which
  // re-enters bindSettingsControls(); an unconditional call here would loop.
  // The "Refresh" button (below) re-pulls on demand.
  if (!SETTINGS.loaded) loadSettingsData();

  document.getElementById('saveProfileBtn').addEventListener('click', async ()=>{
    const btn = document.getElementById('saveProfileBtn');
    btn.disabled = true;
    try{
      const updated = await updateMyProfile({
        fullName: document.getElementById('profName').value,
        department: document.getElementById('profDept').value,
        eventAlertsEnabled: document.getElementById('profAlerts').checked,
      });
      AUTH.profile = {...AUTH.profile, ...updated}; // merge: updateMyProfile() doesn't return `role`
      const i = SETTINGS.profiles.findIndex(x=>x.id===updated.id);
      if (i>=0) SETTINGS.profiles[i] = {...SETTINGS.profiles[i], ...updated};
      renderApp(); toast('Profile saved');
    }catch(e){ toast('Could not save — '+(e.message||'try again')); btn.disabled = false; }
  });

  document.getElementById('reloadTeamBtn').addEventListener('click', reloadSettingsData);
  document.getElementById('newInviteBtn').addEventListener('click', openNewInviteModal);

  document.querySelectorAll('[data-copy-invite]').forEach(b=>b.addEventListener('click', async ()=>{
    const link = invitesApi.inviteLink({ token: b.dataset.copyInvite, email: b.dataset.inviteEmail || '' });
    try{ await navigator.clipboard.writeText(link); toast('Invite link copied'); }
    catch(e){ openInviteLinkModal(link); }
  }));
  document.querySelectorAll('[data-revoke-invite]').forEach(b=>b.addEventListener('click', ()=>{
    openConfirmModal('Revoke this invite? The link stops working immediately.', async ()=>{
      try{ await invitesApi.revoke(b.dataset.revokeInvite); toast('Invite revoked'); reloadSettingsData(); }
      catch(e){ toast('Could not revoke'); }
    }, 'Revoke');
  }));

  document.querySelectorAll('[data-toggle-role]').forEach(b=>b.addEventListener('click', ()=>{
    const id = b.dataset.toggleRole; const next = b.dataset.nextRole;
    openConfirmModal(next==='admin' ? 'Make this member an admin?' : 'Remove admin from this member?', async ()=>{
      try{
        await profilesApi.setRole(id, next);
        const t = SETTINGS.profiles.find(x=>x.id===id); if (t) t.role = next;
        renderView(); toast('Role updated');
      }catch(e){ toast('Could not update role — ' + (e.message || 'try again')); }
    }, next==='admin' ? 'Make admin' : 'Make member');
  }));

  document.getElementById('addProductCatBtn')?.addEventListener('click', async ()=>{
    const inp = document.getElementById('newProductCat');
    const name = inp.value.trim();
    if (!name) return;
    try{
      const saved = await categoriesApi.create('product', name);
      DATA.settings.productCategories.push(saved);
      inp.value=''; renderView(); toast('Category added');
    }catch(e){ toast('Could not add — ' + (e.message || 'try again')); }
  });
  document.getElementById('addServiceCatBtn')?.addEventListener('click', async ()=>{
    const inp = document.getElementById('newServiceCat');
    const name = inp.value.trim();
    if (!name) return;
    try{
      const saved = await categoriesApi.create('service', name);
      DATA.settings.serviceCategories.push(saved);
      inp.value=''; renderView(); toast('Category added');
    }catch(e){ toast('Could not add — ' + (e.message || 'try again')); }
  });
  document.querySelectorAll('[data-rename-category]').forEach(b=>b.addEventListener('click', ()=>{
    const [kind, id] = b.dataset.renameCategory.split(':');
    openRenameCategoryModal(kind, id, b.dataset.catName);
  }));
  document.querySelectorAll('[data-del-category]').forEach(b=>b.addEventListener('click', ()=>{
    const [kind, id] = b.dataset.delCategory.split(':');
    openConfirmModal('Remove this category?', async ()=>{
      try{
        await categoriesApi.remove(kind, id);
        const key = kind==='product' ? 'productCategories' : 'serviceCategories';
        DATA.settings[key] = DATA.settings[key].filter(c=>c.id!==id);
        renderView(); toast('Category removed');
      }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
    }, 'Remove');
  }));

  document.getElementById('addConnectorBtn').addEventListener('click', openAddConnectorModal);
  document.querySelectorAll('[data-del-connector]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = b.dataset.delConnector;
    try{
      await connectorsApi.remove(id);
      DATA.settings.connectors = DATA.settings.connectors.filter(c=>c.id!==id);
      renderView();
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));
  const addRssSourceBtn = document.getElementById('addRssSourceBtn');
  if (addRssSourceBtn) addRssSourceBtn.addEventListener('click', openAddRssSourceModal);
  document.querySelectorAll('[data-del-rss-source]').forEach(b=>b.addEventListener('click', ()=>{
    const id = b.dataset.delRssSource;
    openConfirmModal('Remove this RSS source? It stops being polled; items it already added to the News feed stay.', async ()=>{
      try{
        await rssSourcesApi.remove(id);
        DATA.settings.rssSources = DATA.settings.rssSources.filter(s=>s.id!==id);
        renderView(); toast('Source removed');
      }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
    }, 'Remove');
  }));
  document.getElementById('clearLogBtn').addEventListener('click', ()=>{
    openConfirmModal('Clear the activity log for everyone? This deletes every entry and can’t be undone.', async ()=>{
      try{
        await activityApi.clearAll();
        DATA.activityLog = []; activityEnd = true; renderView(); toast('Log cleared');
      }catch(e){ toast('Could not clear — ' + (e.message || 'try again')); }
    }, 'Clear log');
  });
  const loadMoreActivityBtn = document.getElementById('loadMoreActivityBtn');
  if (loadMoreActivityBtn) loadMoreActivityBtn.addEventListener('click', async ()=>{
    loadMoreActivityBtn.disabled = true;
    const oldest = DATA.activityLog.reduce((m, a) => (!m || (a.ts || '') < m) ? (a.ts || '') : m, '');
    try{
      const { rows, end } = await store.loadMoreActivity(oldest);
      const have = new Set(DATA.activityLog.map(a => a.id));
      DATA.activityLog.push(...rows.filter(r => !have.has(r.id)));
      activityEnd = end;
      renderView();
    }catch(e){ toast('Could not load more — ' + (e.message || 'try again')); loadMoreActivityBtn.disabled = false; }
  });
}

function openNewInviteModal(){
  openModal(`
    <h3>New invite</h3>
    <div class="field">
      <label>Email <span style="font-weight:400;color:var(--muted);">(optional — lock the link to one address)</span></label>
      <input id="invEmail" type="email" placeholder="leave blank for anyone with the link">
    </div>
    <div class="field">
      <label>Expires in</label>
      <select id="invDays">
        <option value="7" selected>7 days</option>
        <option value="14">14 days</option>
        <option value="30">30 days</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Create link</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const save = body.querySelector('#mSave');
      save.disabled = true;
      try{
        const inv = await invitesApi.create({
          email: body.querySelector('#invEmail').value,
          expiresDays: Number(body.querySelector('#invDays').value),
        });
        logActivity('Created an invite', inv.email || 'open link');
        closeModal();
        reloadSettingsData();
        openInviteLinkModal(invitesApi.inviteLink(inv));
      }catch(e){ toast('Could not create invite'); save.disabled = false; }
    };
  });
}

function openInviteLinkModal(link){
  openModal(`
    <h3>Invite link</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">Send this to the new teammate. It works once.</p>
    <div class="field"><textarea id="invLink" readonly style="min-height:64px;">${esc(link)}</textarea></div>
    <div class="modal-actions">
      <button class="btn" id="mClose">Close</button>
      <button class="btn btn-primary" id="mCopy">Copy</button>
    </div>
  `, body=>{
    body.querySelector('#mClose').onclick = closeModal;
    const ta = body.querySelector('#invLink');
    ta.addEventListener('focus', ()=>ta.select());
    body.querySelector('#mCopy').onclick = async ()=>{
      try{ await navigator.clipboard.writeText(link); toast('Copied'); }
      catch(e){ ta.select(); try{ document.execCommand('copy'); toast('Copied'); }catch(_){ toast('Select the text and copy it'); } }
    };
  });
}
// Generic copy-link fallback (V2 HT-C — Store share links). Only works for
// someone already signed in as a member; the auth gate still applies, so
// this can't reintroduce the no-login access deferred in PRD-v2 §0.
function openLinkModal(title, message, link){
  openModal(`
    <h3>${esc(title)}</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">${esc(message)}</p>
    <div class="field"><textarea id="genLink" readonly style="min-height:64px;">${esc(link)}</textarea></div>
    <div class="modal-actions">
      <button class="btn" id="mClose">Close</button>
      <button class="btn btn-primary" id="mCopy">Copy</button>
    </div>
  `, body=>{
    body.querySelector('#mClose').onclick = closeModal;
    const ta = body.querySelector('#genLink');
    ta.addEventListener('focus', ()=>ta.select());
    body.querySelector('#mCopy').onclick = async ()=>{
      try{ await navigator.clipboard.writeText(link); toast('Copied'); }
      catch(e){ ta.select(); try{ document.execCommand('copy'); toast('Copied'); }catch(_){ toast('Select the text and copy it'); } }
    };
  });
}
function openRenameCategoryModal(kind, id, currentName){
  openModal(`
    <h3>Rename category</h3>
    <div class="field"><label>Name</label><input id="mName" value="${esc(currentName)}"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Save</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        await categoriesApi.rename(kind, id, name);
        const list = kind==='product' ? DATA.settings.productCategories : DATA.settings.serviceCategories;
        const cat = list.find(c=>c.id===id); if (cat) cat.name = name;
        closeModal(); renderApp(); toast('Category renamed');
      }catch(e){ toast('Could not rename — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function openAddConnectorModal(){
  openModal(`
    <h3>Add connector / data source</h3>
    <div class="field"><label>Name</label><input id="mName" placeholder="e.g. NIPEX Vendor Portal"></div>
    <div class="field"><label>Type</label><input id="mType" placeholder="e.g. Procurement portal"></div>
    <div class="field"><label>URL</label><input id="mUrl"></div>
    <div class="field"><label>Notes</label><textarea id="mNotes"></textarea></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const connector = {
        id: crypto.randomUUID(), name,
        type: body.querySelector('#mType').value.trim(),
        url: normalizeUrlish(body.querySelector('#mUrl').value),
        notes: body.querySelector('#mNotes').value.trim(),
      };
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await connectorsApi.create(connector);
        DATA.settings.connectors.push(saved);
        closeModal(); renderView(); toast('Connector added');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function openAddRssSourceModal(){
  openModal(`
    <h3>Add RSS source</h3>
    <div class="field"><label>Name</label><input id="mName" placeholder="e.g. Offshore Technology News"></div>
    <div class="field"><label>Feed URL</label><input id="mUrl" placeholder="https://example.com/feed"></div>
    <div class="field"><label>Category</label><input id="mCategory" placeholder="e.g. Industry news (optional)"></div>
    <p style="font-size:11px;color:var(--muted);">Polled every 6 hours by the scheduled server-side job; new items land in the News feed marked "live".</p>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      const url = normalizeUrlish(body.querySelector('#mUrl').value);
      if (!name){ toast('Name required'); return; }
      if (!url){ toast('Feed URL required'); return; }
      const source = { name, url, category: body.querySelector('#mCategory').value.trim() };
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await rssSourcesApi.create(source);
        DATA.settings.rssSources.push(saved);
        closeModal(); renderView(); toast('Source added');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

/* ============================================================
   AUTH SCREENS — replaces the old passcode gate (PRD §5.4)
   Sign in · Forgot password · Complete sign-up (with ?invite=) ·
   Set new password · "check your inbox" · profile-less account.
   ============================================================ */
function authCard(inner){
  document.getElementById('app').innerHTML =
    `<div class="gate-wrap"><div class="gate-card">
       <div class="gate-brand">AEROSUB</div>${inner}
     </div></div>`;
  try{ document.getElementById('modalScrim').classList.remove('open'); }catch(e){}
  bindPasswordToggles();
}
function authMsg(text, kind){
  const el = document.getElementById('aMsg');
  if (el){ el.textContent = text || ''; el.className = 'gate-msg' + (kind ? (' '+kind) : ''); }
}
function setAuthMode(mode){ AUTH.mode = mode; renderAuth(); }
function bindEnter(ids, fn){
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e=>{ if (e.key==='Enter'){ e.preventDefault(); fn(); } });
  });
}

function renderAuth(){
  if (AUTH.mode === 'loading'){ authCard(`<h2>Loading…</h2>`); return; }

  if (AUTH.mode === 'signup'){
    const lockEmail = !!AUTH.pinnedEmail;
    authCard(`
      <h2>Create your account</h2>
      <p>You've been invited to the Aerosub Business Development Pipeline. Set up your login below.</p>
      <div class="field"><label>Full name</label><input id="aName" autocomplete="name"></div>
      <div class="field"><label>Email</label><input id="aEmail" type="email" autocomplete="username" value="${esc(AUTH.pinnedEmail)}" ${lockEmail?'readonly':''}></div>
      ${pwField('Password', 'aPass', { autocomplete: 'new-password', placeholder: 'At least 10 characters' })}
      <button class="btn btn-primary" id="aSubmit" style="width:100%;justify-content:center;">Create account</button>
      <div class="gate-msg" id="aMsg"></div>
      <button class="linklike gate-alt" id="aToSignin">Already have an account? Sign in</button>
    `);
    document.getElementById('aToSignin').onclick = ()=>setAuthMode('signin');
    const submit = async ()=>{
      const fullName = document.getElementById('aName').value.trim();
      const email = document.getElementById('aEmail').value.trim();
      const password = document.getElementById('aPass').value;
      if (!fullName) return authMsg('Enter your name.', 'err');
      if (!email) return authMsg('Enter your email.', 'err');
      if (password.length < 10) return authMsg('Password must be at least 10 characters.', 'err');
      const btn = document.getElementById('aSubmit'); btn.disabled = true; authMsg('Creating your account…');
      try{
        await signUpWithInvite({ fullName, email, password, token: AUTH.inviteToken });
        AUTH.pendingEmail = email;
        setAuthMode('sent-confirm');
      }catch(e){ btn.disabled = false; authMsg(e.message || SIGNUP_FAILED_MESSAGE, 'err'); }
    };
    document.getElementById('aSubmit').onclick = submit;
    bindEnter(['aName','aEmail','aPass'], submit);
    return;
  }

  if (AUTH.mode === 'sent-confirm'){
    authCard(`
      <h2>Check your inbox</h2>
      <p>We sent a confirmation link to <b>${esc(AUTH.pendingEmail || 'your email')}</b>. Open it to finish setting up your account, then come back and sign in.</p>
      <button class="btn btn-primary" id="aToSignin" style="width:100%;justify-content:center;">Back to sign in</button>
    `);
    document.getElementById('aToSignin').onclick = ()=>setAuthMode('signin');
    return;
  }

  if (AUTH.mode === 'reset'){
    authCard(`
      <h2>Reset password</h2>
      <p>Enter your email and we'll send a link to set a new password.</p>
      <div class="field"><label>Email</label><input id="aEmail" type="email" autocomplete="username"></div>
      <button class="btn btn-primary" id="aSubmit" style="width:100%;justify-content:center;">Send reset link</button>
      <div class="gate-msg" id="aMsg"></div>
      <button class="linklike gate-alt" id="aToSignin">Back to sign in</button>
    `);
    document.getElementById('aToSignin').onclick = ()=>setAuthMode('signin');
    const submit = async ()=>{
      const email = document.getElementById('aEmail').value.trim();
      if (!email) return authMsg('Enter your email.', 'err');
      const btn = document.getElementById('aSubmit'); btn.disabled = true; authMsg('Sending…');
      try{ await resetPassword(email); }catch(e){ /* never reveal whether the address exists */ }
      AUTH.pendingEmail = email;
      setAuthMode('sent-reset');
    };
    document.getElementById('aSubmit').onclick = submit;
    bindEnter(['aEmail'], submit);
    return;
  }

  if (AUTH.mode === 'sent-reset'){
    authCard(`
      <h2>Check your inbox</h2>
      <p>If an account exists for <b>${esc(AUTH.pendingEmail || 'that address')}</b>, a password-reset link is on its way.</p>
      <button class="btn btn-primary" id="aToSignin" style="width:100%;justify-content:center;">Back to sign in</button>
    `);
    document.getElementById('aToSignin').onclick = ()=>setAuthMode('signin');
    return;
  }

  if (AUTH.mode === 'set-password'){
    authCard(`
      <h2>Set a new password</h2>
      <p>Choose a new password for your account.</p>
      ${pwField('New password', 'aPass', { autocomplete: 'new-password', placeholder: 'At least 10 characters' })}
      ${pwField('Confirm password', 'aPass2', { autocomplete: 'new-password' })}
      <button class="btn btn-primary" id="aSubmit" style="width:100%;justify-content:center;">Update password</button>
      <div class="gate-msg" id="aMsg"></div>
    `);
    const submit = async ()=>{
      const pw = document.getElementById('aPass').value;
      const pw2 = document.getElementById('aPass2').value;
      if (pw.length < 10) return authMsg('Password must be at least 10 characters.', 'err');
      if (pw !== pw2) return authMsg('Passwords do not match.', 'err');
      const btn = document.getElementById('aSubmit'); btn.disabled = true; authMsg('Updating…');
      try{
        await updatePassword(pw);
        toast('Password updated');
        await enterApp();
      }catch(e){ btn.disabled = false; authMsg(e.message || 'Could not update password.', 'err'); }
    };
    document.getElementById('aSubmit').onclick = submit;
    bindEnter(['aPass','aPass2'], submit);
    return;
  }

  if (AUTH.mode === 'no-profile'){
    authCard(`
      <h2>Account not active</h2>
      <p>You're signed in, but this account isn't a member of the Aerosub pipeline. Your invite may not have been completed, or your access was removed. Ask a teammate for a fresh invite link.</p>
      <button class="btn btn-primary" id="aSignOut" style="width:100%;justify-content:center;">Sign out</button>
    `);
    document.getElementById('aSignOut').onclick = async ()=>{ await signOut(); };
    return;
  }

  // default: sign in
  authCard(`
    <h2>Sign in</h2>
    <p>Aerosub Business Development Pipeline — team access.</p>
    <div class="field"><label>Email</label><input id="aEmail" type="email" autocomplete="username"></div>
    ${pwField('Password', 'aPass', { autocomplete: 'current-password' })}
    <button class="btn btn-primary" id="aSubmit" style="width:100%;justify-content:center;">Sign in</button>
    <div class="gate-msg" id="aMsg"></div>
    <button class="linklike gate-alt" id="aForgot">Forgot password?</button>
    ${AUTH.inviteToken ? `<button class="linklike gate-alt" id="aToSignup">Have an invite? Create your account</button>` : ''}
  `);
  document.getElementById('aForgot').onclick = ()=>setAuthMode('reset');
  const toSignup = document.getElementById('aToSignup');
  if (toSignup) toSignup.onclick = ()=>setAuthMode('signup');
  const submit = async ()=>{
    const email = document.getElementById('aEmail').value.trim();
    const password = document.getElementById('aPass').value;
    if (!email || !password) return authMsg('Enter your email and password.', 'err');
    const btn = document.getElementById('aSubmit'); btn.disabled = true; authMsg('Signing in…');
    try{
      await signIn({ email, password });
      logActivity('Signed in');   // only on an explicit password submit (HT11)
      // onAuthChange('SIGNED_IN') -> enterApp()
    }catch(e){
      btn.disabled = false;
      const m = /email not confirmed/i.test(e.message||'')
        ? 'Confirm your email first — check your inbox for the link.'
        : /invalid login credentials/i.test(e.message||'')
        ? 'Wrong email or password.'
        : (e.message || 'Could not sign in.');
      authMsg(m, 'err');
    }
  };
  document.getElementById('aSubmit').onclick = submit;
  bindEnter(['aEmail','aPass'], submit);
}

/* ============================================================
   BOOT — session -> profile -> app, else an auth screen (PRD §5.5)
   ============================================================ */
async function enterApp(){
  const profile = await myProfile();
  if (!profile){ AUTH.profile = null; setAuthMode('no-profile'); return; }
  AUTH.profile = profile;
  AUTH.mode = 'app';
  SETTINGS.loaded = false;
  STORE_SHARES.loaded = false; ITEM_SHARE.key = null;
  CREATE_DATA.loaded = false; QUOTE_EDITOR.loaded = false; QUOTE_EDITOR.quoteId = null;
  RFQ_DATA.loaded = false; RFQ_EDITOR.loaded = false; RFQ_EDITOR.rfqId = null;
  TEAM_ROSTER.loaded = false;
  const u = new URL(location.href);
  const storeParam = u.searchParams.get('store');   // V2 HT-C share deep link
  if (location.search.indexOf('invite=') !== -1 || location.search.indexOf('email=') !== -1 || storeParam){
    u.searchParams.delete('invite'); u.searchParams.delete('email'); u.searchParams.delete('store');
    history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
  }
  await loadDataAndRender();
  if (storeParam) openStoreShareLink(storeParam);
}

// A Store "Copy link" (V2 HT-C) lands here as ?store=product:<id> or
// ?store=service:<id> — members-only: this is a deep link, not a new grant
// (every member can already read every item), and it silently no-ops if the
// item doesn't resolve (deleted, or a malformed param).
function openStoreShareLink(param){
  const [kind, id] = String(param).split(':');
  if (kind!=='product' && kind!=='service') return;
  if (!storeItemById(kind, id)) return;
  ui.view = 'solutions'; ui.storeTab = kind==='service' ? 'services' : 'products';
  renderApp();
  storeKindOpen(kind, id);
}

// Loads every table from Supabase (src/store.js) and renders the app, or a
// retry screen if the load fails (e.g. offline right after signing in).
async function loadDataAndRender(){
  renderLoadingScreen();
  try{
    DATA = await store.loadAll();
    researchEnd = false; activityEnd = false;
    renderApp();
    loadTeamRoster(); // warm it early — Plan/Companies/RFQ assignee pickers all need it (V2 HT-E/F)
  }catch(e){
    renderLoadingScreen({ error: e.message || 'Could not load your data.' });
  }
}

// Re-checks membership when something suggests the session may no longer be
// a member (a write denied by RLS, or the tab regaining focus after being
// left open). A profile-less session otherwise reads as a silently-empty
// app; here it's bounced to the "ask for a new invite" screen instead.
let guardInFlight = false;
async function guardMembership(){
  if (AUTH.mode !== 'app' || guardInFlight) return true;
  guardInFlight = true;
  let member;
  try{ member = await amIMember(); }
  finally{ guardInFlight = false; }
  if (member !== false) return true;   // true = member, null = couldn't check
  AUTH.profile = null;
  DATA = null;
  setAuthMode('no-profile');
  return false;
}
function renderLoadingScreen({ error } = {}){
  document.getElementById('app').innerHTML = `
    <div class="gate-wrap"><div class="gate-card">
      <div class="gate-brand">AEROSUB</div>
      <h2>${error ? 'Could not load' : 'Loading…'}</h2>
      ${error
        ? `<p style="color:var(--critical);">${esc(error)}</p><button class="btn btn-primary" id="retryLoadBtn" style="width:100%;justify-content:center;">Try again</button>`
        : `<p>Pulling the latest data…</p>`}
    </div></div>
  `;
  const retry = document.getElementById('retryLoadBtn');
  if (retry) retry.onclick = loadDataAndRender;
}

async function boot(){
  const params = new URLSearchParams(location.search);
  AUTH.inviteToken = params.get('invite') || null;
  AUTH.pinnedEmail = params.get('email') || '';

  window.addEventListener('aerosub:rls-denied', () => { guardMembership(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) guardMembership(); });

  onAuthChange(async (event, session)=>{
    AUTH.session = session || null;
    if (event === 'PASSWORD_RECOVERY'){ setAuthMode('set-password'); return; }
    if (event === 'SIGNED_OUT'){
      AUTH.profile = null;
      setAuthMode(AUTH.inviteToken ? 'signup' : 'signin');
      return;
    }
    if (event === 'SIGNED_IN'){
      if (AUTH.mode === 'set-password') return;   // recovery session — wait for the new password
      if (AUTH.mode === 'app') return;
      await enterApp();
      return;
    }
    if (event === 'USER_UPDATED'){
      if (AUTH.mode !== 'app') return;
      const p = await myProfile();
      if (!p){ AUTH.profile = null; setAuthMode('no-profile'); }
      else AUTH.profile = p;
      return;
    }
    // TOKEN_REFRESHED / INITIAL_SESSION — nothing to do here
  });

  const session = await getSession();
  AUTH.session = session;
  if (!session){ setAuthMode(AUTH.inviteToken ? 'signup' : 'signin'); return; }
  await enterApp();
}

/* ============================================================
   CONTACTS VIEW
   ============================================================ */
function allContacts(){
  const rows = [];
  DATA.companies.forEach(c=>c.contacts.forEach(ct=>rows.push(ct)));
  return rows;
}
function filteredContacts(){
  const q = ui.search.trim().toLowerCase();
  return allContacts().filter(ct=>{
    if (!q) return true;
    const co = companyById(ct.companyId);
    return ct.name.toLowerCase().includes(q) || ct.pos.toLowerCase().includes(q) || (co && co.name.toLowerCase().includes(q));
  });
}
function renderContacts(){
  const rows = filteredContacts().sort((a,b)=> (b.verified-a.verified) || a.name.localeCompare(b.name));
  return `
  <div class="card tablewrap">
    <table>
      <thead><tr><th>Name</th><th>Company</th><th>Position</th><th>Email</th><th>Phone</th><th>LinkedIn</th><th>Follow-up</th></tr></thead>
      <tbody>
      ${rows.map(ct=>{
        const co = companyById(ct.companyId);
        return `<tr data-open-contact="${ct.id}">
          <td class="name-cell">${esc(ct.name)} ${ct.verified?`<span class="verified-tick">✓</span>`:''}</td>
          <td>${co?esc(co.name):''}</td>
          <td><span class="sub">${esc(ct.pos)}</span></td>
          <td>${ct.email?esc(ct.email):'<span class="sub">Not public</span>'}</td>
          <td>${ct.phone?esc(ct.phone):''}</td>
          <td>${ct.linkedin?`<a href="https://${esc(stripProto(ct.linkedin))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Profile</a>`:''}</td>
          <td>${ct.nextFollowUp?`<span style="color:${isOverdue(ct.nextFollowUp)?'var(--critical)':'var(--ink)'}">${fmtDate(ct.nextFollowUp)}</span>`:'<span class="sub">—</span>'}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    ${rows.length===0?`<div class="empty">${ICONS.empty}<div>No contacts match.</div></div>`:''}
  </div>`;
}
function bindContactsControls(){
  document.querySelectorAll('[data-open-contact]').forEach(row=>{
    row.addEventListener('click', ()=>openEditContactModal(row.dataset.openContact));
  });
}

/* ============================================================
   TASKS VIEW
   ============================================================ */
// V2 HT-F: a task lands in Personal if you own or are assigned to it
// (regardless of its visibility flag — this is what makes an assigned
// general task show in both tabs, per item 6's "only task assigned to you
// will appear in both personal and general"); General shows every
// visibility='general' task, full stop. RLS already guarantees you only
// ever receive personal rows you're entitled to see, so no extra
// filtering is needed to keep this safe.
function taskTabItems(){
  const me = AUTH.profile?.id;
  return DATA.tasks.filter(t=> ui.taskTab==='general' ? t.visibility==='general' : (t.ownerId===me || t.assignedTo===me));
}
function renderTasks(){
  if (!TEAM_ROSTER.loaded) loadTeamRoster();
  const list = taskTabItems();
  const open = list.filter(t=>!t.done);
  const overdue = open.filter(t=>isOverdue(t.due)).sort((a,b)=>a.due.localeCompare(b.due));
  const week = open.filter(t=>!isOverdue(t.due) && daysUntil(t.due)<=7).sort((a,b)=>a.due.localeCompare(b.due));
  const later = open.filter(t=>!isOverdue(t.due) && daysUntil(t.due)>7).sort((a,b)=>a.due.localeCompare(b.due));
  const done = list.filter(t=>t.done);

  const group = (title, items) => items.length ? `
    <div class="task-group">
      <h3>${title} <span class="cnt">${items.length}</span></h3>
      ${items.map(taskCard).join('')}
    </div>` : '';

  return `
    <div class="toolbar">
      <div class="seg">
        <button data-task-tab="personal" class="${ui.taskTab==='personal'?'active':''}">Personal</button>
        <button data-task-tab="general" class="${ui.taskTab==='general'?'active':''}">General</button>
      </div>
    </div>
    ${group('Overdue', overdue)}
    ${group('Next 7 days', week)}
    ${group('Later', later)}
    ${group('Done', done)}
    ${list.length===0 ? `<div class="empty">${ICONS.empty}<div>${ui.taskTab==='personal'?'Nothing personal yet — actions you create start here.':'No general actions yet.'}</div></div>` : ''}
  `;
}
function taskCard(t){
  const co = companyById(t.companyId);
  const me = AUTH.profile?.id;
  const canShare = t.visibility==='personal' && t.ownerId===me;
  return `
    <div class="task-card ${t.done?'done':''}">
      <input type="checkbox" data-toggle-task-g="${t.id}" ${t.done?'checked':''}>
      <div style="flex:1;min-width:0;">
        <div class="title">${esc(t.title)}</div>
        ${co?`<div class="co" data-open-company="${co.id}">${esc(co.name)}</div>`:''}
        <div class="sub" style="margin-top:2px;">
          ${t.visibility==='personal'?`<span class="chip chip-low" style="font-size:9px;">Personal</span> `:''}
          ${t.assignedTo?`Assigned to ${esc(teammateName(t.assignedTo)||'…')}`:''}
        </div>
      </div>
      <span class="chip chip-${t.priority}"><span class="chip-dot"></span>${t.priority}</span>
      <div class="due ${!t.done && isOverdue(t.due)?'overdue':''}">${t.due?fmtDate(t.due):'—'}</div>
      ${canShare?`<button class="btn btn-sm btn-ghost" data-share-task-g="${t.id}" title="Share to general">${ICONS.upload}</button>`:''}
      <button class="del" data-del-task-g="${t.id}">${ICONS.x}</button>
    </div>
  `;
}
function bindTasksControls(){
  document.querySelectorAll('[data-task-tab]').forEach(b=>b.addEventListener('click', ()=>{ ui.taskTab=b.dataset.taskTab; renderView(); }));
  document.querySelectorAll('[data-toggle-task-g]').forEach(b=>b.addEventListener('change', async ()=>{
    const t = DATA.tasks.find(x=>x.id===b.dataset.toggleTaskG);
    if (!t) return;
    try{ await tasksApi.toggleDone(t.id, b.checked); t.done = b.checked; }
    catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
    renderApp();
  }));
  document.querySelectorAll('[data-del-task-g]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = b.dataset.delTaskG;
    try{ await tasksApi.remove(id); DATA.tasks = DATA.tasks.filter(t=>t.id!==id); renderApp(); }
    catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-share-task-g]').forEach(b=>b.addEventListener('click', ()=>{
    const t = DATA.tasks.find(x=>x.id===b.dataset.shareTaskG);
    if (!t) return;
    openConfirmModal('Share this action to General? Everyone will be able to see and act on it — this can\'t be undone.', async ()=>{
      try{ await tasksApi.shareToGeneral(t.id); t.visibility = 'general'; renderApp(); toast('Shared to General'); }
      catch(e){ toast('Could not share — ' + (e.message || 'try again')); }
    }, 'Share');
  }));
  document.querySelectorAll('[data-open-company]').forEach(el=>{
    el.addEventListener('click', (e)=>{ e.stopPropagation(); openDrawer(el.dataset.openCompany); });
  });
}

/* ============================================================
   STORE VIEW (V2 HT-B/C) — Dashboard / Product / Service sub-tabs over the
   catalog that used to be the single "Products & Offers" view.
   ============================================================ */
function taggedCompaniesForService(serviceId){
  const rows = [];
  DATA.companies.forEach(c=>{
    (c.recommendedServices||[]).forEach((r,i)=>{ if (r.svc===serviceId) rows.push({company:c, why:r.why, index:i}); });
  });
  return rows;
}
function untaggedCompaniesForService(serviceId){
  const taggedIds = new Set(taggedCompaniesForService(serviceId).map(r=>r.company.id));
  return DATA.companies.filter(c=>!taggedIds.has(c.id));
}
function categoryName(list, id){ const c = list.find(x=>x.id===id); return c ? c.name : ''; }

// --- kind-generic helpers (kind: 'product' | 'service') --------------------
function storeKindItems(kind){ return kind==='service' ? DATA.services : DATA.solutions; }
function storeKindApi(kind){ return kind==='service' ? servicesApi : productsApi; }
function storeKindCategories(kind){ return kind==='service' ? DATA.settings.serviceCategories : DATA.settings.productCategories; }
function storeKindTagged(kind, id){ return kind==='service' ? taggedCompaniesForService(id) : taggedCompaniesFor(id); }
function storeKindOpen(kind, id){ return kind==='service' ? openServiceDrawer(id) : openProductDrawer(id); }
function storeItemById(kind, id){ return kind==='service' ? serviceById(id) : solutionById(id); }

// Shared by the quote drawer (HT-D) and the RFQ drawer (HT-E) — both need
// "search products & services, add one as a line item".
function searchCatalogItems(qStr){
  const q = qStr.trim().toLowerCase();
  if (!q) return [];
  const productMatches = DATA.solutions.filter(s=>!s.archivedAt && s.name.toLowerCase().includes(q)).slice(0,5).map(s=>({...s, kind:'product'}));
  const serviceMatches = DATA.services.filter(s=>!s.archivedAt && s.name.toLowerCase().includes(q)).slice(0,5).map(s=>({...s, kind:'service'}));
  return [...productMatches, ...serviceMatches];
}

function filteredStoreItems(kind){
  const q = ui.search.trim().toLowerCase();
  const sharedIds = ui.storeShowSharedOnly
    ? new Set(STORE_SHARES.sharedWithMe.filter(sh=>sh.item_type===kind).map(sh=>sh.item_id))
    : null;
  let base = storeKindItems(kind).filter(s=>
    (ui.storeShowArchived || !s.archivedAt) && (!sharedIds || sharedIds.has(s.id))
  );
  if (!q) return base;
  return base.filter(s=>
    s.name.toLowerCase().includes(q) || (s.tag||'').toLowerCase().includes(q) || (s.blurb||'').toLowerCase().includes(q)
  );
}

function storeAllItems(){
  return [
    ...DATA.solutions.map(s=>({...s, kind:'product'})),
    ...DATA.services.map(s=>({...s, kind:'service'})),
  ];
}

function renderSolutions(){
  const onGrid = ui.storeTab!=='dashboard';
  return `
    <div class="toolbar">
      <div class="seg">
        <button data-store-tab="dashboard" class="${ui.storeTab==='dashboard'?'active':''}">Dashboard</button>
        <button data-store-tab="products" class="${ui.storeTab==='products'?'active':''}">Products</button>
        <button data-store-tab="services" class="${ui.storeTab==='services'?'active':''}">Services</button>
      </div>
      ${onGrid ? `
      <div class="seg" style="margin-left:12px;">
        <button data-store-layout="cards" class="${ui.storeLayout==='cards'?'active':''}">Cards</button>
        <button data-store-layout="list" class="${ui.storeLayout==='list'?'active':''}">List</button>
      </div>
      <label class="row" style="gap:6px;align-items:center;font-size:11.5px;color:var(--muted);margin-left:12px;">
        <input type="checkbox" id="storeShowArchived" ${ui.storeShowArchived?'checked':''}> Show archived
      </label>
      <label class="row" style="gap:6px;align-items:center;font-size:11.5px;color:var(--muted);margin-left:12px;">
        <input type="checkbox" id="storeShowSharedOnly" ${ui.storeShowSharedOnly?'checked':''}> Shared with me
      </label>` : ''}
    </div>
    ${ui.storeTab==='dashboard' ? renderStoreDashboard() : renderStoreGrid(ui.storeTab==='services'?'service':'product')}
  `;
}

function renderStoreDashboard(){
  const active = storeAllItems().filter(s=>!s.archivedAt);
  const recent = [...active].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,5);
  const mostSearched = active.filter(s=>s.searchCount>0).sort((a,b)=>b.searchCount-a.searchCount).slice(0,5);
  const mostQuoted = active.filter(s=>s.addedToQuoteCount>0).sort((a,b)=>b.addedToQuoteCount-a.addedToQuoteCount).slice(0,5);
  const tile = (items, emptyLabel, metric)=> items.length===0
    ? `<div class="empty" style="padding:14px;">${ICONS.empty}<div>${emptyLabel}</div></div>`
    : items.map(s=>`
        <div class="needs-row" data-store-dash-open="${s.kind}:${s.id}" style="cursor:pointer;">
          <span class="t"><span class="chip chip-teal" style="margin-right:6px;">${s.kind==='service'?'Service':'Product'}</span>${esc(s.name)}</span>
          <span class="d">${esc(metric(s))}</span>
        </div>`).join('');
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
      <div class="card panel"><h3>Recently added</h3>${tile(recent, 'Nothing added yet.', s=>s.createdAt?fmtDate(s.createdAt.slice(0,10)):'')}</div>
      <div class="card panel"><h3>Most searched</h3>${tile(mostSearched, 'No searches recorded yet.', s=>String(s.searchCount))}</div>
      <div class="card panel"><h3>Most added to quote</h3>${tile(mostQuoted, 'Nothing added to a quote yet.', s=>String(s.addedToQuoteCount))}</div>
      <div class="card panel">
        <h3>Totals</h3>
        <div class="needs-row"><span class="t">Products</span><span class="d tabular">${DATA.solutions.filter(s=>!s.archivedAt).length}</span></div>
        <div class="needs-row"><span class="t">Services</span><span class="d tabular">${DATA.services.filter(s=>!s.archivedAt).length}</span></div>
      </div>
    </div>
  `;
}

function renderStoreGrid(kind){
  const all = filteredStoreItems(kind);
  const list = all.slice(0, ui.storeVisibleCount);
  const categories = storeKindCategories(kind);
  const remaining = all.length - list.length;
  const body = !list.length
    ? `<div class="empty">${ICONS.empty}<div>No ${kind==='service'?'services':'products'} match.</div></div>`
    : ui.storeLayout==='list' ? renderStoreList(list, kind, categories) : renderStoreCards(list, kind, categories);
  return `
    ${ui.storeSelected.size>0 ? renderStoreBulkToolbar(ui.storeSelected.size) : ''}
    ${body}
    ${remaining>0 ? `<div style="text-align:center;margin-top:14px;"><button class="btn btn-sm btn-ghost" id="storeShowMoreBtn">Show ${Math.min(50,remaining)} more (${remaining} left)</button></div>` : ''}
  `;
}

function renderStoreCards(list, kind, categories){
  return `<div class="sol-grid">
    ${list.map(s=>{
      const tagged = storeKindTagged(kind, s.id);
      const hl = (s.highlights||[]).slice(0,2);
      const openAttr = kind==='service' ? `data-open-service="${s.id}"` : `data-open-product="${s.id}"`;
      return `
      <div class="card sol-card" ${openAttr} style="cursor:pointer;position:relative;${s.archivedAt?'opacity:.55;':''}">
        <input type="checkbox" data-store-select="${s.id}" ${ui.storeSelected.has(s.id)?'checked':''} style="position:absolute;top:12px;left:12px;">
        <div class="row" style="justify-content:space-between;margin-bottom:8px;padding-left:22px;">
          <span class="chip chip-teal">${esc((kind==='product'&&s.tag) || categoryName(categories, s.categoryId) || 'General')}</span>
          <span class="chip ${statusChipClass(s.status||'Active')}">${esc(s.status||'Active')}</span>
        </div>
        <h3>${esc(s.name)}${kind==='product'&&s.oem?' <span class="chip chip-gold" style="font-size:9px;">OEM</span>':''}</h3>
        <p>${esc(s.blurb||'')}</p>
        ${s.priceAmount!=null ? `<div class="sub" style="margin-bottom:6px;">${esc(s.priceCurrency)} ${s.priceAmount.toLocaleString()}</div>` : ''}
        ${hl.length ? `<div class="bullets" style="margin-bottom:10px;">${hl.map(h=>`<div class="bullet solution" style="font-size:11.5px;padding:6px 8px;">${esc(h)}</div>`).join('')}</div>` : ''}
        <div class="adopters">Tagged to: ${tagged.length?tagged.map(t=>esc(t.company.name)).join(', '):'no accounts yet'}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderStoreList(list, kind, categories){
  return `
  <div class="card tablewrap">
    <table>
      <thead><tr><th></th><th>Name</th><th>Category</th><th>Status</th><th>Price</th><th></th></tr></thead>
      <tbody>
        ${list.map(s=>{
          const expanded = ui.storeExpanded.has(s.id);
          const tagged = storeKindTagged(kind, s.id);
          const hl = s.highlights||[];
          return `
          <tr>
            <td><input type="checkbox" data-store-select="${s.id}" ${ui.storeSelected.has(s.id)?'checked':''}></td>
            <td class="name-cell" data-store-open="${kind}:${s.id}" style="cursor:pointer;">${esc(s.name)}${s.archivedAt?' <span class="sub">(archived)</span>':''}</td>
            <td>${esc(categoryName(categories, s.categoryId)||'—')}</td>
            <td><span class="chip ${statusChipClass(s.status||'Active')}">${esc(s.status||'Active')}</span></td>
            <td class="tabular">${s.priceAmount!=null?esc(s.priceCurrency+' '+s.priceAmount.toLocaleString()):'—'}</td>
            <td style="text-align:right;"><button class="btn btn-sm btn-ghost" data-store-expand="${s.id}">${expanded?'Less':'More'}</button></td>
          </tr>
          ${expanded?`<tr><td></td><td colspan="5">
            <div class="sub" style="padding:6px 0;">${esc(s.blurb||'No description.')}</div>
            ${hl.length?`<div class="bullets" style="margin-bottom:8px;">${hl.map(h=>`<div class="bullet solution" style="font-size:11.5px;padding:6px 8px;">${esc(h)}</div>`).join('')}</div>`:''}
            <div class="adopters">Tagged to: ${tagged.length?tagged.map(t=>esc(t.company.name)).join(', '):'no accounts yet'}</div>
          </td></tr>`:''}
          `;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderStoreBulkToolbar(count){
  return `
  <div class="card panel" style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin-bottom:12px;flex-wrap:wrap;">
    <b>${count} selected</b>
    <button class="btn btn-sm" id="storeBulkArchiveBtn">Archive</button>
    <button class="btn btn-sm" id="storeBulkUnarchiveBtn">Unarchive</button>
    <button class="btn btn-sm" id="storeBulkExportBtn">Export CSV</button>
    <button class="btn btn-sm" id="storeBulkQuoteBtn">Add to quote</button>
    <button class="btn btn-sm btn-ghost" id="storeBulkDeleteBtn" style="color:#f3d9d6;">Delete</button>
    <button class="btn btn-sm btn-ghost" id="storeBulkClearBtn" style="margin-left:auto;">Clear selection</button>
  </div>`;
}

function csvEscape(v){
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

function bindSolutionsControls(){
  if (!STORE_SHARES.loaded) loadStoreShares();

  document.querySelectorAll('[data-store-tab]').forEach(b=>b.addEventListener('click', ()=>{
    ui.storeTab=b.dataset.storeTab; ui.search=''; ui.storeSelected.clear(); ui.storeVisibleCount=50; renderApp();
  }));
  document.querySelectorAll('[data-store-layout]').forEach(b=>b.addEventListener('click', ()=>{ ui.storeLayout=b.dataset.storeLayout; renderView(); }));

  const archived = document.getElementById('storeShowArchived');
  if (archived) archived.addEventListener('change', e=>{ ui.storeShowArchived = e.target.checked; ui.storeVisibleCount=50; renderView(); });
  const sharedOnly = document.getElementById('storeShowSharedOnly');
  if (sharedOnly) sharedOnly.addEventListener('change', e=>{ ui.storeShowSharedOnly = e.target.checked; ui.storeVisibleCount=50; renderView(); });

  const openWithSearchTracking = (kind, id)=>{
    if (ui.search.trim()){
      const item = storeItemById(kind, id);
      if (item){ storeKindApi(kind).incrementSearchCount(id, item.searchCount).catch(()=>{}); item.searchCount = (item.searchCount||0)+1; }
    }
    storeKindOpen(kind, id);
  };
  document.querySelectorAll('[data-open-product]').forEach(el=>{
    el.addEventListener('click', ()=>openWithSearchTracking('product', el.dataset.openProduct));
  });
  document.querySelectorAll('[data-open-service]').forEach(el=>{
    el.addEventListener('click', ()=>openWithSearchTracking('service', el.dataset.openService));
  });
  document.querySelectorAll('[data-store-open]').forEach(el=>{
    el.addEventListener('click', ()=>{ const [kind,id]=el.dataset.storeOpen.split(':'); openWithSearchTracking(kind, id); });
  });
  document.querySelectorAll('[data-store-dash-open]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const [kind,id]=el.dataset.storeDashOpen.split(':');
      ui.storeTab = kind==='service' ? 'services' : 'products';
      renderApp();
      storeKindOpen(kind, id);
    });
  });

  document.querySelectorAll('[data-store-select]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const id = el.dataset.storeSelect;
      if (ui.storeSelected.has(id)) ui.storeSelected.delete(id); else ui.storeSelected.add(id);
      renderView();
    });
  });
  document.querySelectorAll('[data-store-expand]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const id = el.dataset.storeExpand;
      if (ui.storeExpanded.has(id)) ui.storeExpanded.delete(id); else ui.storeExpanded.add(id);
      renderView();
    });
  });
  const showMoreBtn = document.getElementById('storeShowMoreBtn');
  if (showMoreBtn) showMoreBtn.addEventListener('click', ()=>{ ui.storeVisibleCount += 50; renderView(); });

  // --- bulk toolbar ---------------------------------------------------
  const kind = ui.storeTab==='services' ? 'service' : 'product';
  const api = storeKindApi(kind);
  const selectedItems = ()=> storeKindItems(kind).filter(s=>ui.storeSelected.has(s.id));

  const archiveBtn = document.getElementById('storeBulkArchiveBtn');
  if (archiveBtn) archiveBtn.addEventListener('click', async ()=>{
    for (const it of selectedItems()){ try{ await api.archive(it.id); it.archivedAt = new Date().toISOString(); }catch(e){} }
    ui.storeSelected.clear(); renderView(); toast('Archived');
  });
  const unarchiveBtn = document.getElementById('storeBulkUnarchiveBtn');
  if (unarchiveBtn) unarchiveBtn.addEventListener('click', async ()=>{
    for (const it of selectedItems()){ try{ await api.unarchive(it.id); it.archivedAt = ''; }catch(e){} }
    ui.storeSelected.clear(); renderView(); toast('Unarchived');
  });
  const quoteBtn = document.getElementById('storeBulkQuoteBtn');
  if (quoteBtn) quoteBtn.addEventListener('click', async ()=>{
    for (const it of selectedItems()){ try{ await api.incrementAddedToQuoteCount(it.id, it.addedToQuoteCount); it.addedToQuoteCount = (it.addedToQuoteCount||0)+1; }catch(e){} }
    ui.storeSelected.clear(); renderView();
    toast('Added to quote count — full Quote building lands in the Create tab');
  });
  const exportBtn = document.getElementById('storeBulkExportBtn');
  if (exportBtn) exportBtn.addEventListener('click', ()=>{
    const categories = storeKindCategories(kind);
    const header = kind==='product' ? ['name','category','blurb','price','currency','vendor','oem'] : ['name','category','blurb','price','currency'];
    const rows = selectedItems().map(it=>{
      const base = [it.name, categoryName(categories, it.categoryId), it.blurb||'', it.priceAmount??'', it.priceCurrency];
      return kind==='product' ? [...base, it.vendorName||'', it.oem?'yes':'no'] : base;
    });
    const csv = [header, ...rows].map(r=>r.map(csvEscape).join(',')).join('\n');
    downloadFile(`aerosub-${kind}s-export-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
  });
  const deleteBtn = document.getElementById('storeBulkDeleteBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', ()=>{
    const items = selectedItems();
    openConfirmModal(`Delete ${items.length} ${kind}${items.length===1?'':'s'}? This also untags ${items.length===1?'it':'them'} from every account and can't be undone.`, async ()=>{
      for (const it of items){
        try{
          await api.remove(it.id);
          if (kind==='product'){
            DATA.companies.forEach(c=>{ c.recommended = c.recommended.filter(r=>r.sol!==it.id); });
            DATA.solutions = DATA.solutions.filter(x=>x.id!==it.id);
          } else {
            DATA.companies.forEach(c=>{ c.recommendedServices = (c.recommendedServices||[]).filter(r=>r.svc!==it.id); });
            DATA.services = DATA.services.filter(x=>x.id!==it.id);
          }
        }catch(e){}
      }
      ui.storeSelected.clear(); renderApp(); toast('Deleted');
    });
  });
  const clearBtn = document.getElementById('storeBulkClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', ()=>{ ui.storeSelected.clear(); renderView(); });
}

/* ============================================================
   CREATE TAB (V2 HT-D) — Quotes/Proforma/Commercials built from an
   uploaded template. .html templates only (PRD-v2 §4 — .docx deferred,
   not built half-way).
   ============================================================ */
function quoteTemplateById(id){ return CREATE_DATA.templates.find(t=>t.id===id); }
function quoteById(id){ return CREATE_DATA.quotes.find(q=>q.id===id); }

function renderCreate(){
  if (!CREATE_DATA.loaded) return `<div class="empty" style="padding:14px;">${ICONS.empty}<div>Loading…</div></div>`;
  return `
    <div class="toolbar">
      <div class="seg">
        <button data-create-tab="quotes" class="${ui.createTab==='quotes'?'active':''}">Quotes</button>
        <button data-create-tab="templates" class="${ui.createTab==='templates'?'active':''}">Templates</button>
      </div>
    </div>
    ${ui.createTab==='templates' ? renderTemplatesList() : renderQuotesList()}
  `;
}

function renderTemplatesList(){
  const list = CREATE_DATA.templates;
  if (!list.length) return `<div class="empty">${ICONS.empty}<div>No templates uploaded yet — click "Upload template" to add your first Quote/Proforma/Commercial template.</div></div>`;
  return `<div class="sol-grid">
    ${list.map(t=>{
      const mapped = Object.values(t.fieldMap||{}).filter(Boolean).length;
      return `
      <div class="card sol-card" data-open-template="${t.id}" style="cursor:pointer;">
        <div class="row" style="justify-content:space-between;margin-bottom:8px;">
          <span class="chip chip-teal">${esc(t.kind)}</span>
          <span class="sub">${mapped} field${mapped===1?'':'s'} mapped</span>
        </div>
        <h3>${esc(t.name)}</h3>
        <div class="adopters">${esc(t.filePath.split('/').pop())}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderQuotesList(){
  const list = CREATE_DATA.quotes;
  if (!list.length) return `<div class="empty">${ICONS.empty}<div>No quotes yet — click "New quote" to build one from a template.</div></div>`;
  return `
  <div class="card tablewrap">
    <table>
      <thead><tr><th>Kind</th><th>Number</th><th>Client</th><th>Currency</th><th>Created</th></tr></thead>
      <tbody>
        ${list.map(q=>{
          const co = companyById(q.companyId);
          return `<tr data-open-quote="${q.id}" style="cursor:pointer;">
            <td><span class="chip chip-teal">${esc(q.kind)}</span></td>
            <td>${esc(q.quoteNumber||'—')}</td>
            <td>${co?esc(co.name):'<span class="sub">—</span>'}</td>
            <td class="tabular">${esc(q.currency)}</td>
            <td class="sub">${q.createdAt?new Date(q.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

// Shared by the upload and manage-template modals.
function tokenMapRowsHtml(tokens, fieldMap){
  if (!tokens.length) return `<p class="sub" style="margin-top:8px;">No {{tokens}} found in this file — it'll upload as-is with nothing to fill in.</p>`;
  return `<div class="dsec" style="margin-top:10px;">
    <div class="dsec-head"><h4>Map each token</h4></div>
    ${tokens.map(tok=>`
      <div class="add-inline">
        <span style="flex:1;font-family:var(--font-mono);font-size:12px;">{{${esc(tok)}}}</span>
        <select data-token-map="${esc(tok)}">
          <option value="">— leave as text —</option>
          ${QUOTE_FIELDS.map(f=>`<option value="${f.key}" ${(fieldMap[tok]===f.key)?'selected':''}>${esc(f.label)}</option>`).join('')}
        </select>
      </div>`).join('')}
  </div>`;
}
function readTokenMap(body, tokens){
  const fieldMap = {};
  tokens.forEach(tok=>{
    const sel = body.querySelector(`[data-token-map="${tok}"]`);
    if (sel && sel.value) fieldMap[tok] = sel.value;
  });
  return fieldMap;
}

function openUploadTemplateModal(){
  openModal(`
    <h3>Upload template</h3>
    <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">
      .html only for now. Use <code>{{token}}</code> placeholders anywhere in the file — you'll map each one below.
    </p>
    <div class="field"><label>Name</label><input id="mName" placeholder="e.g. Standard Quote"></div>
    <div class="field"><label>Type</label><select id="mKind"><option>Quote</option><option>Proforma</option><option>Commercial</option></select></div>
    <div class="field"><label>Template file (.html)</label><input type="file" id="mFile" accept=".html,text/html"></div>
    <div id="mMapArea"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave" disabled>Save template</button>
    </div>
  `, body=>{
    let rawText = ''; let tokens = [];
    body.querySelector('#mCancel').onclick = closeModal;
    const saveBtn = body.querySelector('#mSave');
    body.querySelector('#mFile').addEventListener('change', async e=>{
      const file = e.target.files[0]; if (!file) return;
      rawText = await file.text();
      tokens = detectTokens(rawText);
      body.querySelector('#mMapArea').innerHTML = tokenMapRowsHtml(tokens, {});
      saveBtn.disabled = false;
    });
    saveBtn.onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const file = body.querySelector('#mFile').files[0];
      if (!file){ toast('Choose a file first'); return; }
      saveBtn.disabled = true;
      try{
        const path = await uploadFile(file, 'quote-templates');
        const fieldMap = readTokenMap(body, tokens);
        const saved = await quoteTemplatesApi.create({ name, kind: body.querySelector('#mKind').value, filePath: path, fieldMap });
        CREATE_DATA.templates.unshift(saved);
        closeModal(); renderApp(); toast('Template saved');
      }catch(e){ toast('Could not save — ' + (e.message || 'try again')); saveBtn.disabled = false; }
    };
  });
}

function openManageTemplateModal(id){
  const t = quoteTemplateById(id);
  if (!t) return;
  openModal(`
    <h3>Manage template</h3>
    <div class="field"><label>Name</label><input id="mName" value="${esc(t.name)}"></div>
    <div id="mMapArea"><p class="sub">Loading…</p></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mDelete" style="margin-right:auto;color:#f3d9d6;">Delete</button>
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Save</button>
    </div>
  `, body=>{
    let tokens = [];
    body.querySelector('#mCancel').onclick = closeModal;
    downloadText(t.filePath).then(rawText=>{
      tokens = detectTokens(rawText);
      body.querySelector('#mMapArea').innerHTML = tokenMapRowsHtml(tokens, t.fieldMap||{});
    }).catch(()=>{
      body.querySelector('#mMapArea').innerHTML = `<p class="sub">Could not load the template file to re-map it — you can still rename or delete.</p>`;
    });
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const fieldMap = readTokenMap(body, tokens);
      try{
        await quoteTemplatesApi.rename(t.id, name);
        await quoteTemplatesApi.setFieldMap(t.id, fieldMap);
        t.name = name; t.fieldMap = fieldMap;
        closeModal(); renderApp(); toast('Template saved');
      }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
    };
    body.querySelector('#mDelete').onclick = ()=>{
      openConfirmModal(`Delete "${t.name}"? Quotes already built from it keep working — their line items don't change — but you won't be able to start a new one from it.`, async ()=>{
        try{
          await quoteTemplatesApi.remove(t.id);
          await removeFile(t.filePath);
          CREATE_DATA.templates = CREATE_DATA.templates.filter(x=>x.id!==t.id);
          closeModal(); renderApp(); toast('Template deleted');
        }catch(e){ toast('Could not delete — ' + (e.message || 'try again')); }
      });
    };
  });
}

function openAddQuoteModal(){
  if (!CREATE_DATA.templates.length){ toast('Upload a template first'); return; }
  const templateOptions = CREATE_DATA.templates.map(t=>`<option value="${t.id}">${esc(t.name)} (${esc(t.kind)})</option>`).join('');
  const companyOptions = DATA.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  openModal(`
    <h3>New quote</h3>
    <div class="field"><label>Template</label><select id="mTemplate">${templateOptions}</select></div>
    <div class="field"><label>Type</label><select id="mKind"><option>Quote</option><option>Proforma</option><option>Commercial</option></select></div>
    <div class="field"><label>Client (optional)</label><select id="mCo"><option value="">— none yet —</option>${companyOptions}</select></div>
    <div class="field"><label>Quote number (optional)</label><input id="mNumber" placeholder="e.g. Q-2026-014"></div>
    <div class="field"><label>Currency</label><select id="mCurrency"><option value="NGN">NGN</option><option value="USD">USD</option></select></div>
    <div class="field"><label>Default markup %</label><input id="mMarkup" type="number" value="30" min="0" step="1"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Create quote</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    const tplSel = body.querySelector('#mTemplate');
    const kindSel = body.querySelector('#mKind');
    const syncKind = ()=>{ const t = quoteTemplateById(tplSel.value); if (t) kindSel.value = t.kind; };
    tplSel.addEventListener('change', syncKind);
    syncKind();
    body.querySelector('#mSave').onclick = async ()=>{
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const quote = {
          id: crypto.randomUUID(), templateId: tplSel.value, kind: kindSel.value,
          companyId: body.querySelector('#mCo').value, quoteNumber: body.querySelector('#mNumber').value.trim(),
          currency: body.querySelector('#mCurrency').value, markupPercent: Number(body.querySelector('#mMarkup').value) || 30,
        };
        const saved = await quotesApi.create(quote);
        CREATE_DATA.quotes.unshift(saved);
        closeModal(); renderApp();
        openQuoteDrawer(saved.id);
      }catch(e){ toast('Could not create — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function updateQuotePreview(q, tpl){
  const frame = document.getElementById('quotePreview');
  if (!frame || !tpl || !(QUOTE_EDITOR.loaded && QUOTE_EDITOR.quoteId===q.id)) return;
  const co = companyById(q.companyId);
  const fieldValues = buildQuoteFieldValues({ quote: q, lineItems: QUOTE_EDITOR.lineItems, companyName: co?co.name:'', preparedBy: currentUserName() });
  frame.srcdoc = renderTemplate(QUOTE_EDITOR.templateText, tpl.fieldMap, fieldValues);
}

function renderQuoteDrawer(){
  const q = quoteById(ui.drawerQuoteId);
  const drawer = document.getElementById('drawer');
  if (!q){ drawer.innerHTML=''; return; }
  const tpl = quoteTemplateById(q.templateId);
  const ready = QUOTE_EDITOR.loaded && QUOTE_EDITOR.quoteId===q.id;
  const lineItems = ready ? QUOTE_EDITOR.lineItems : [];
  if (!ready) loadQuoteEditor(q);

  const rows = computeLineTotals(lineItems);
  const subtotal = rows.reduce((s,r)=>s+r.lineTotal, 0);
  const fmt = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  drawer.innerHTML = `
    <button class="drawer-close" id="drawerCloseBtn">${ICONS.x}</button>
    <div class="drawer-head">
      <div class="eyebrow">${tpl?esc(tpl.name):'No template — it may have been deleted'}</div>
      <h2>${esc(q.kind)}${q.quoteNumber?' — '+esc(q.quoteNumber):''}</h2>
      <div class="field-row">
        <select id="kindSelect"><option ${q.kind==='Quote'?'selected':''}>Quote</option><option ${q.kind==='Proforma'?'selected':''}>Proforma</option><option ${q.kind==='Commercial'?'selected':''}>Commercial</option></select>
        <button class="btn btn-sm btn-ghost" id="deleteQuoteBtn" style="color:#f3d9d6;border:1px solid var(--navy-line);">Delete quote</button>
      </div>
    </div>
    <div class="drawer-body">
      <div class="dsec">
        <div class="dsec-head"><h4>Details</h4></div>
        <div class="add-inline"><select id="qCompany"><option value="">— no client yet —</option>${DATA.companies.map(c=>`<option value="${c.id}" ${q.companyId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="add-inline"><input id="qNumber" value="${esc(q.quoteNumber||'')}" placeholder="Quote number"></div>
        <div class="add-inline">
          <select id="qCurrency"><option value="NGN" ${q.currency==='NGN'?'selected':''}>NGN</option><option value="USD" ${q.currency==='USD'?'selected':''}>USD</option></select>
          <input id="qMarkup" type="number" min="0" step="1" value="${q.markupPercent}" placeholder="Default markup %">
        </div>
        <textarea class="notes-area" id="qNotes" placeholder="Notes…">${esc(q.notes||'')}</textarea>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveQuoteDetailsBtn">Save details</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Line items (${lineItems.length})</h4></div>
        ${!ready ? `<div class="sub">Loading…</div>` : lineItems.length===0 ? `<div class="empty" style="padding:14px;">${ICONS.empty}<div>No items yet — search below to add a product or service.</div></div>` :
          rows.map(r=>`
            <div class="rec-card">
              <div class="row" style="justify-content:space-between;gap:8px;">
                <div class="rname">${esc(r.description)}</div>
                <button class="x" data-del-li="${r.id}" style="background:none;border:none;color:var(--teal-strong);cursor:pointer;">${ICONS.x}</button>
              </div>
              <div class="row" style="gap:10px;margin-top:6px;flex-wrap:wrap;align-items:center;">
                <label class="sub">Qty <input type="number" min="0.01" step="1" value="${r.qty}" data-li-field="qty" data-li-id="${r.id}" style="width:60px;"></label>
                <label class="sub">Cost <input type="number" min="0" step="0.01" value="${r.unitCost}" data-li-field="unitCost" data-li-id="${r.id}" style="width:90px;"></label>
                <label class="sub">Markup × <input type="number" min="0" step="0.01" value="${r.markupMultiplier}" data-li-field="markupMultiplier" data-li-id="${r.id}" style="width:70px;"></label>
                <span class="sub">= ${esc(q.currency)} ${fmt(r.lineTotal)}</span>
              </div>
            </div>
          `).join('')}
        ${ready ? `
        <div class="add-inline"><input id="liSearch" placeholder="Search products & services to add…"></div>
        <div id="liResults"></div>` : ''}
        <div class="sub" style="margin-top:10px;text-align:right;font-size:14px;"><b>Total: ${esc(q.currency)} ${fmt(subtotal)}</b></div>
      </div>

      ${tpl ? `
      <div class="dsec">
        <div class="dsec-head"><h4>Preview & export</h4></div>
        <div class="report-preview-wrap" style="height:360px;">
          <iframe id="quotePreview" sandbox referrerpolicy="no-referrer" style="width:100%;height:100%;border:1px solid var(--line);border-radius:8px;"></iframe>
        </div>
        <div class="small-btn-row" style="margin-top:10px;">
          <button class="btn btn-sm" id="exportQuoteHtmlBtn">Export .html</button>
          <button class="btn btn-sm btn-ghost" id="exportQuoteMdBtn">Export .md</button>
        </div>
      </div>` : `<div class="dsec"><div class="empty" style="padding:14px;">${ICONS.empty}<div>This quote's template was deleted — export still works as .md.</div></div>
        <div class="small-btn-row"><button class="btn btn-sm btn-ghost" id="exportQuoteMdBtn">Export .md</button></div></div>`}
    </div>
  `;
  bindQuoteDrawer(q, tpl);
}

function bindQuoteDrawer(q, tpl){
  document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
  updateQuotePreview(q, tpl);

  document.getElementById('kindSelect').addEventListener('change', async e=>{
    const kind = e.target.value;
    try{ await quotesApi.setKind(q.id, kind); q.kind = kind; renderApp(); openQuoteDrawer(q.id); }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
  });
  document.getElementById('deleteQuoteBtn').addEventListener('click', ()=>{
    openConfirmModal(`Delete this ${q.kind.toLowerCase()}? This can't be undone.`, async ()=>{
      try{
        await quotesApi.remove(q.id);
        CREATE_DATA.quotes = CREATE_DATA.quotes.filter(x=>x.id!==q.id);
        closeDrawer(); renderApp(); toast('Deleted');
      }catch(e){ toast('Could not delete — ' + (e.message || 'try again')); }
    });
  });
  document.getElementById('saveQuoteDetailsBtn').addEventListener('click', async ()=>{
    const companyId = document.getElementById('qCompany').value;
    const quoteNumber = document.getElementById('qNumber').value.trim();
    const currency = document.getElementById('qCurrency').value;
    const markupPercent = Number(document.getElementById('qMarkup').value) || 0;
    const notes = document.getElementById('qNotes').value;
    try{
      await Promise.all([
        quotesApi.setCompany(q.id, companyId),
        quotesApi.setQuoteNumber(q.id, quoteNumber),
        quotesApi.setCurrency(q.id, currency),
        quotesApi.setMarkupPercent(q.id, markupPercent),
        quotesApi.setNotes(q.id, notes),
      ]);
      q.companyId = companyId; q.quoteNumber = quoteNumber; q.currency = currency; q.markupPercent = markupPercent; q.notes = notes;
      toast('Details saved'); renderApp(); openQuoteDrawer(q.id);
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });

  document.querySelectorAll('[data-li-field]').forEach(inp=>inp.addEventListener('change', async ()=>{
    const id = inp.dataset.liId; const field = inp.dataset.liField;
    const li = QUOTE_EDITOR.lineItems.find(x=>x.id===id);
    if (!li) return;
    const value = Number(inp.value);
    if (Number.isNaN(value) || value<0 || (field==='qty' && value<=0)){ toast('Enter a valid number'); renderQuoteDrawer(); return; }
    try{
      await quotesApi.updateLineItem(id, { [field]: value });
      li[field] = value;
      renderQuoteDrawer();
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-del-li]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = b.dataset.delLi;
    try{
      await quotesApi.removeLineItem(id);
      QUOTE_EDITOR.lineItems = QUOTE_EDITOR.lineItems.filter(x=>x.id!==id);
      renderQuoteDrawer();
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));

  const liSearch = document.getElementById('liSearch');
  if (liSearch) liSearch.addEventListener('input', ()=>{
    const results = document.getElementById('liResults');
    const matches = searchCatalogItems(liSearch.value);
    if (!liSearch.value.trim()){ results.innerHTML=''; return; }
    results.innerHTML = matches.length===0 ? `<div class="sub" style="padding:6px;">No matches.</div>` :
      matches.map(m=>`<div class="bullet solution" data-add-li="${m.kind}:${m.id}" style="cursor:pointer;">
        <span style="flex:1;">${esc(m.name)} <span class="sub">(${m.kind})</span></span>
        <span class="sub">${m.priceAmount!=null?esc(m.priceCurrency+' '+m.priceAmount.toLocaleString()):'no price set'}</span>
      </div>`).join('');
    document.querySelectorAll('[data-add-li]').forEach(el=>el.addEventListener('click', async ()=>{
      const [kind, itemId] = el.dataset.addLi.split(':');
      const item = kind==='service' ? serviceById(itemId) : solutionById(itemId);
      if (!item) return;
      try{
        const saved = await quotesApi.addLineItem({
          quoteId: q.id, itemType: kind, itemId: item.id, description: item.name,
          qty: 1, unitCost: item.priceAmount || 0, markupMultiplier: 1 + (q.markupPercent/100),
          position: QUOTE_EDITOR.lineItems.length,
        });
        QUOTE_EDITOR.lineItems.push(saved);
        (kind==='service' ? servicesApi : productsApi).incrementAddedToQuoteCount(item.id, item.addedToQuoteCount).catch(()=>{});
        item.addedToQuoteCount = (item.addedToQuoteCount||0) + 1;
        liSearch.value = ''; results.innerHTML = '';
        renderQuoteDrawer();
        toast('Added');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); }
    }));
  });

  const exportHtmlBtn = document.getElementById('exportQuoteHtmlBtn');
  if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', ()=>{
    const co = companyById(q.companyId);
    const fieldValues = buildQuoteFieldValues({ quote: q, lineItems: QUOTE_EDITOR.lineItems, companyName: co?co.name:'', preparedBy: currentUserName() });
    const html = renderTemplate(QUOTE_EDITOR.templateText, tpl.fieldMap, fieldValues);
    downloadFile(`${q.kind.toLowerCase()}-${q.quoteNumber || q.id.slice(0,8)}.html`, html, 'text/html');
    logActivity(`Exported a ${q.kind.toLowerCase()}`, q.quoteNumber || q.id);
  });
  const exportMdBtn = document.getElementById('exportQuoteMdBtn');
  if (exportMdBtn) exportMdBtn.addEventListener('click', ()=>{
    const co = companyById(q.companyId);
    const md = buildQuoteMarkdown({ quote: q, lineItems: QUOTE_EDITOR.lineItems, companyName: co?co.name:'' });
    downloadFile(`${q.kind.toLowerCase()}-${q.quoteNumber || q.id.slice(0,8)}.md`, md, 'text/markdown');
  });
}

function bindCreateControls(){
  if (!CREATE_DATA.loaded) loadCreateData();
  document.querySelectorAll('[data-create-tab]').forEach(b=>b.addEventListener('click', ()=>{ ui.createTab=b.dataset.createTab; renderApp(); }));
  document.querySelectorAll('[data-open-template]').forEach(el=>el.addEventListener('click', ()=>openManageTemplateModal(el.dataset.openTemplate)));
  document.querySelectorAll('[data-open-quote]').forEach(el=>el.addEventListener('click', ()=>openQuoteDrawer(el.dataset.openQuote)));
  const uploadBtn = document.getElementById('uploadTemplateBtn');
  if (uploadBtn) uploadBtn.addEventListener('click', openUploadTemplateModal);
  const addQuoteBtn = document.getElementById('addQuoteBtn');
  if (addQuoteBtn) addQuoteBtn.addEventListener('click', openAddQuoteModal);
}

/* ============================================================
   RFQ MANAGER (V2 HT-E) — item 4: publish/assign gated to admin, research
   vendors + add catalog items, Branch, Gallery, export reuses the Create
   tab's quote engine (vendor fields never leave this tab).
   ============================================================ */
const RFQ_STATUSES = ['draft','published','in_progress','bidding','won','lost'];
function rfqStatusLabel(s){ return ({draft:'Draft', published:'Published', in_progress:'In Progress', bidding:'Bidding', won:'Won', lost:'Lost'})[s] || s; }
function rfqStatusChipClass(s){
  return s==='won' ? 'chip-good' : s==='lost' ? 'chip-high' : s==='bidding' ? 'chip-gold' : (s==='published'||s==='in_progress') ? 'chip-medium' : 'chip-low';
}
function rfqById(id){ return RFQ_DATA.rfqs.find(r=>r.id===id); }

function renderRfqs(){
  if (!RFQ_DATA.loaded) return `<div class="empty" style="padding:14px;">${ICONS.empty}<div>Loading…</div></div>`;
  const list = RFQ_DATA.rfqs;
  if (!list.length) return `<div class="empty">${ICONS.empty}<div>No RFQs yet — click "New RFQ" to add one.</div></div>`;
  return `
  <div class="card tablewrap">
    <table>
      <thead><tr><th>Title</th><th>Client</th><th>Status</th><th>Assigned to</th><th>Created</th></tr></thead>
      <tbody>
        ${list.map(r=>{
          const co = companyById(r.companyId);
          return `<tr data-open-rfq="${r.id}" style="cursor:pointer;">
            <td class="name-cell">${esc(r.title)}${r.parentRfqId?' <span class="sub">(branch)</span>':''}</td>
            <td>${co?esc(co.name):'<span class="sub">—</span>'}</td>
            <td><span class="chip ${rfqStatusChipClass(r.status)}">${esc(rfqStatusLabel(r.status))}</span></td>
            <td>${r.assignedTo?esc(teammateName(r.assignedTo)):'<span class="sub">unassigned</span>'}</td>
            <td class="sub">${r.createdAt?new Date(r.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function openAddRfqModal(){
  const companyOptions = DATA.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  openModal(`
    <h3>New RFQ</h3>
    <div class="field"><label>Title</label><input id="mTitle" placeholder="e.g. Amni RFQ 7972"></div>
    <div class="field"><label>Reference (optional)</label><input id="mRef" placeholder="e.g. RFQ 7972"></div>
    <div class="field"><label>Client (optional)</label><select id="mCo"><option value="">— none yet —</option>${companyOptions}</select></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Create RFQ</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const title = body.querySelector('#mTitle').value.trim();
      if (!title){ toast('Title required'); return; }
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await rfqsApi.create({ title, reference: body.querySelector('#mRef').value.trim(), companyId: body.querySelector('#mCo').value });
        RFQ_DATA.rfqs.unshift(saved);
        closeModal(); renderApp();
        openRfqDrawer(saved.id);
      }catch(e){ toast('Could not create — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function openExportRfqAsQuoteModal(rfq){
  if (!CREATE_DATA.templates.length){ toast('Upload a quote template first (Create tab)'); return; }
  const templateOptions = CREATE_DATA.templates.map(t=>`<option value="${t.id}">${esc(t.name)} (${esc(t.kind)})</option>`).join('');
  openModal(`
    <h3>Export "${esc(rfq.title)}" as a quote</h3>
    <div class="field"><label>Template</label><select id="mTemplate">${templateOptions}</select></div>
    <div class="field"><label>Type</label><select id="mKind"><option>Quote</option><option>Proforma</option><option>Commercial</option></select></div>
    <div class="field"><label>Quote number (optional)</label><input id="mNumber"></div>
    <div class="field"><label>Currency</label><select id="mCurrency"><option value="NGN">NGN</option><option value="USD">USD</option></select></div>
    <div class="field"><label>Default markup %</label><input id="mMarkup" type="number" value="30" min="0" step="1"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Create & open</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    const tplSel = body.querySelector('#mTemplate');
    const kindSel = body.querySelector('#mKind');
    const syncKind = ()=>{ const t = quoteTemplateById(tplSel.value); if (t) kindSel.value = t.kind; };
    tplSel.addEventListener('change', syncKind);
    syncKind();
    body.querySelector('#mSave').onclick = async ()=>{
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const quote = {
          id: crypto.randomUUID(), templateId: tplSel.value, kind: kindSel.value,
          companyId: rfq.companyId, quoteNumber: body.querySelector('#mNumber').value.trim(),
          currency: body.querySelector('#mCurrency').value, markupPercent: Number(body.querySelector('#mMarkup').value) || 30,
          sourceRfqId: rfq.id,
        };
        const savedQuote = await quotesApi.create(quote);
        CREATE_DATA.quotes.unshift(savedQuote);
        // Copy items into the quote — vendor_name/vendor_verified deliberately
        // dropped (item 4: verified-vendor marks are UI-only, never exported).
        for (const it of RFQ_EDITOR.items){
          await quotesApi.addLineItem({
            quoteId: savedQuote.id, itemType: it.itemType, itemId: it.itemId, description: it.description,
            qty: it.qty, unitCost: it.unitCost, markupMultiplier: it.markupMultiplier, position: it.position,
          });
        }
        QUOTE_EDITOR.loaded = false;
        closeModal(); closeDrawer();
        ui.view = 'create'; ui.createTab = 'quotes'; renderApp();
        openQuoteDrawer(savedQuote.id);
        toast('Quote created from the RFQ');
      }catch(e){ toast('Could not export — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function renderRfqDrawer(){
  const r = rfqById(ui.drawerRfqId);
  const drawer = document.getElementById('drawer');
  if (!r){ drawer.innerHTML=''; return; }
  const ready = RFQ_EDITOR.loaded && RFQ_EDITOR.rfqId===r.id;
  const items = ready ? RFQ_EDITOR.items : [];
  if (!ready) loadRfqEditor(r.id);

  const isAdmin = AUTH.profile?.role==='admin';
  const linkedQuote = CREATE_DATA.loaded ? CREATE_DATA.quotes.find(q=>q.sourceRfqId===r.id) : null;

  drawer.innerHTML = `
    <button class="drawer-close" id="drawerCloseBtn">${ICONS.x}</button>
    <div class="drawer-head">
      <div class="eyebrow">${r.reference?esc(r.reference):'RFQ'}${r.parentRfqId?' · branched':''}</div>
      <h2>${esc(r.title)}</h2>
      <div class="field-row">
        <span class="chip ${rfqStatusChipClass(r.status)}">${esc(rfqStatusLabel(r.status))}</span>
        <button class="btn btn-sm btn-ghost" id="deleteRfqBtn" style="color:#f3d9d6;border:1px solid var(--navy-line);">Delete RFQ</button>
      </div>
    </div>
    <div class="drawer-body">
      <div class="dsec">
        <div class="dsec-head"><h4>Details</h4></div>
        <div class="add-inline"><input id="rTitle" value="${esc(r.title)}" placeholder="Title"></div>
        <div class="add-inline"><input id="rRef" value="${esc(r.reference||'')}" placeholder="Reference"></div>
        <div class="add-inline"><select id="rCompany"><option value="">— no client yet —</option>${DATA.companies.map(c=>`<option value="${c.id}" ${r.companyId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
        <textarea class="notes-area" id="rNotes" placeholder="Notes…">${esc(r.notes||'')}</textarea>
        <div class="small-btn-row"><button class="btn btn-sm btn-primary" id="saveRfqDetailsBtn">Save details</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Status &amp; assignment${isAdmin?'':' <span class="sub">(admin only)</span>'}</h4></div>
        ${isAdmin ? `
        <div class="add-inline">
          <select id="rStatus">${RFQ_STATUSES.map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${rfqStatusLabel(s)}</option>`).join('')}</select>
        </div>
        <div class="add-inline">
          <select id="rAssignee"><option value="">— unassigned —</option>${TEAM_ROSTER.members.map(t=>`<option value="${t.id}" ${r.assignedTo===t.id?'selected':''}>${esc(t.full_name||t.email)}</option>`).join('')}</select>
        </div>` : `
        <div class="needs-row"><span class="t">Assigned to</span><span class="d">${r.assignedTo?esc(teammateName(r.assignedTo)):'Unassigned'}</span></div>
        `}
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Items (${items.length})</h4></div>
        ${!ready ? `<div class="sub">Loading…</div>` : items.length===0 ? `<div class="empty" style="padding:14px;">${ICONS.empty}<div>No items yet — research a vendor and add a product or service below.</div></div>` :
          items.map(it=>`
            <div class="rec-card">
              <div class="row" style="justify-content:space-between;gap:8px;">
                <div class="rname">${esc(it.description)}${it.vendorVerified?` <span class="chip chip-good" style="font-size:9px;">Verified vendor</span>`:''}</div>
                <button class="x" data-del-rfqitem="${it.id}" style="background:none;border:none;color:var(--teal-strong);cursor:pointer;">${ICONS.x}</button>
              </div>
              <div class="row" style="gap:10px;margin-top:6px;flex-wrap:wrap;align-items:center;">
                <label class="sub">Vendor <input value="${esc(it.vendorName||'')}" data-rfqitem-field="vendorName" data-rfqitem-id="${it.id}" style="width:120px;"></label>
                <label class="sub" style="display:flex;align-items:center;gap:4px;"><input type="checkbox" ${it.vendorVerified?'checked':''} data-rfqitem-field="vendorVerified" data-rfqitem-id="${it.id}"> Verified</label>
                <label class="sub">Qty <input type="number" min="0.01" step="1" value="${it.qty}" data-rfqitem-field="qty" data-rfqitem-id="${it.id}" style="width:55px;"></label>
                <label class="sub">Cost <input type="number" min="0" step="0.01" value="${it.unitCost}" data-rfqitem-field="unitCost" data-rfqitem-id="${it.id}" style="width:85px;"></label>
                <label class="sub">Markup × <input type="number" min="0" step="0.01" value="${it.markupMultiplier}" data-rfqitem-field="markupMultiplier" data-rfqitem-id="${it.id}" style="width:65px;"></label>
              </div>
            </div>
          `).join('')}
        ${ready ? `<div class="add-inline"><input id="rfqItemSearch" placeholder="Search products & services to add…"></div><div id="rfqItemResults"></div>` : ''}
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Branch &amp; export</h4></div>
        <p class="sub" style="margin-bottom:8px;">Branch continues this RFQ's research as a new draft, leaving this one untouched. Export builds (or reopens) a client quote from these items — vendor names and the verified badge stay internal, they're never included in the export.</p>
        <div class="small-btn-row">
          <button class="btn btn-sm btn-ghost" id="branchRfqBtn">Branch</button>
          <button class="btn btn-sm btn-primary" id="exportRfqBtn">${linkedQuote?'Open linked quote':'Export as Quote/Commercial'}</button>
        </div>
      </div>
    </div>
  `;
  bindRfqDrawer(r);
}

function bindRfqDrawer(r){
  document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
  document.getElementById('deleteRfqBtn').addEventListener('click', ()=>{
    openConfirmModal(`Delete "${r.title}"? This can't be undone.`, async ()=>{
      try{
        await rfqsApi.remove(r.id);
        RFQ_DATA.rfqs = RFQ_DATA.rfqs.filter(x=>x.id!==r.id);
        closeDrawer(); renderApp(); toast('Deleted');
      }catch(e){ toast('Could not delete — ' + (e.message || 'try again')); }
    });
  });
  document.getElementById('saveRfqDetailsBtn').addEventListener('click', async ()=>{
    const title = document.getElementById('rTitle').value.trim();
    if (!title){ toast('Title required'); return; }
    const reference = document.getElementById('rRef').value.trim();
    const companyId = document.getElementById('rCompany').value;
    const notes = document.getElementById('rNotes').value;
    try{
      await Promise.all([
        rfqsApi.setTitle(r.id, title),
        rfqsApi.setReference(r.id, reference),
        rfqsApi.setCompany(r.id, companyId),
        rfqsApi.setNotes(r.id, notes),
      ]);
      r.title = title; r.reference = reference; r.companyId = companyId; r.notes = notes;
      toast('Details saved'); renderApp(); openRfqDrawer(r.id);
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  });

  const statusSel = document.getElementById('rStatus');
  if (statusSel) statusSel.addEventListener('change', async e=>{
    const status = e.target.value;
    try{ await rfqsApi.setStatus(r.id, status); r.status = status; renderApp(); openRfqDrawer(r.id); }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
  });
  const assigneeSel = document.getElementById('rAssignee');
  if (assigneeSel) assigneeSel.addEventListener('change', async e=>{
    const assignedTo = e.target.value;
    try{ await rfqsApi.setAssignee(r.id, assignedTo); r.assignedTo = assignedTo; renderApp(); openRfqDrawer(r.id); }
    catch(err){ toast('Could not save — ' + (err.message || 'try again')); }
  });

  document.querySelectorAll('[data-rfqitem-field]').forEach(inp=>inp.addEventListener('change', async ()=>{
    const id = inp.dataset.rfqitemId; const field = inp.dataset.rfqitemField;
    const it = RFQ_EDITOR.items.find(x=>x.id===id);
    if (!it) return;
    const value = inp.type==='checkbox' ? inp.checked : (inp.type==='number' ? Number(inp.value) : inp.value);
    if (inp.type==='number' && (Number.isNaN(value) || value<0 || (field==='qty' && value<=0))){
      toast('Enter a valid number'); renderRfqDrawer(); return;
    }
    try{
      await rfqsApi.updateItem(id, { [field]: value });
      it[field] = value;
      renderRfqDrawer();
    }catch(e){ toast('Could not save — ' + (e.message || 'try again')); }
  }));
  document.querySelectorAll('[data-del-rfqitem]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = b.dataset.delRfqitem;
    try{
      await rfqsApi.removeItem(id);
      RFQ_EDITOR.items = RFQ_EDITOR.items.filter(x=>x.id!==id);
      renderRfqDrawer();
    }catch(e){ toast('Could not remove — ' + (e.message || 'try again')); }
  }));

  const rfqItemSearch = document.getElementById('rfqItemSearch');
  if (rfqItemSearch) rfqItemSearch.addEventListener('input', ()=>{
    const results = document.getElementById('rfqItemResults');
    const matches = searchCatalogItems(rfqItemSearch.value);
    if (!rfqItemSearch.value.trim()){ results.innerHTML=''; return; }
    results.innerHTML = matches.length===0 ? `<div class="sub" style="padding:6px;">No matches.</div>` :
      matches.map(m=>`<div class="bullet solution" data-add-rfqitem="${m.kind}:${m.id}" style="cursor:pointer;">
        <span style="flex:1;">${esc(m.name)} <span class="sub">(${m.kind})</span></span>
        <span class="sub">${m.priceAmount!=null?esc(m.priceCurrency+' '+m.priceAmount.toLocaleString()):'no price set'}</span>
      </div>`).join('');
    document.querySelectorAll('[data-add-rfqitem]').forEach(el=>el.addEventListener('click', async ()=>{
      const [kind, itemId] = el.dataset.addRfqitem.split(':');
      const item = kind==='service' ? serviceById(itemId) : solutionById(itemId);
      if (!item) return;
      try{
        const saved = await rfqsApi.addItem({
          rfqId: r.id, itemType: kind, itemId: item.id, description: item.name,
          qty: 1, unitCost: item.priceAmount || 0, markupMultiplier: 1.3, position: RFQ_EDITOR.items.length,
        });
        RFQ_EDITOR.items.push(saved);
        rfqItemSearch.value = ''; results.innerHTML = '';
        renderRfqDrawer();
        toast('Added');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); }
    }));
  });

  document.getElementById('branchRfqBtn').addEventListener('click', async ()=>{
    try{
      const cloned = await rfqsApi.branch(r, RFQ_EDITOR.items);
      RFQ_DATA.rfqs.unshift(cloned);
      closeDrawer(); renderApp();
      openRfqDrawer(cloned.id);
      toast('Branched');
    }catch(e){ toast('Could not branch — ' + (e.message || 'try again')); }
  });

  document.getElementById('exportRfqBtn').addEventListener('click', ()=>{
    const existing = CREATE_DATA.loaded ? CREATE_DATA.quotes.find(q=>q.sourceRfqId===r.id) : null;
    if (existing){
      closeDrawer();
      ui.view = 'create'; ui.createTab = 'quotes'; renderApp();
      openQuoteDrawer(existing.id);
      return;
    }
    openExportRfqAsQuoteModal(r);
  });
}

function bindRfqsControls(){
  if (!RFQ_DATA.loaded) loadRfqData();
  document.querySelectorAll('[data-open-rfq]').forEach(el=>el.addEventListener('click', ()=>openRfqDrawer(el.dataset.openRfq)));
  const addRfqBtn = document.getElementById('addRfqBtn');
  if (addRfqBtn) addRfqBtn.addEventListener('click', openAddRfqModal);
}

/* ============================================================
   INSIGHTS (V2 HT-G) — read-only aggregations, no new tables. Research/RFQ
   counts are org-wide (those tables stay flat). Task breakdowns only cover
   what HT-F's visibility RLS lets the current viewer see — a documented
   scope limit, not a bug: an org-wide count would need a SECURITY DEFINER
   aggregate RPC, which wasn't built for this pass.
   ============================================================ */
function renderInsights(){
  if (!INSIGHTS_DATA.loaded || !RFQ_DATA.loaded) return `<div class="empty" style="padding:14px;">${ICONS.empty}<div>Loading…</div></div>`;

  const rfqByStatus = RFQ_STATUSES.map(s=>({ id:s, label:rfqStatusLabel(s), count: RFQ_DATA.rfqs.filter(r=>r.status===s).length }));
  const rfqMax = Math.max(...rfqByStatus.map(s=>s.count), 1);

  const sectorTally = {};
  DATA.tasks.forEach(t=>{
    const c = companyById(t.companyId);
    const key = c && c.sector ? c.sector : 'No sector';
    sectorTally[key] = (sectorTally[key]||0) + 1;
  });
  const sectorEntries = Object.entries(sectorTally).sort((a,b)=>b[1]-a[1]);
  const sectorMax = Math.max(...sectorEntries.map(e=>e[1]), 1);

  const ownerTally = {};
  DATA.tasks.forEach(t=>{
    const key = t.ownerId ? (teammateName(t.ownerId) || 'Unknown') : 'Unassigned';
    ownerTally[key] = (ownerTally[key]||0) + 1;
  });
  const ownerEntries = Object.entries(ownerTally).sort((a,b)=>b[1]-a[1]);
  const ownerMax = Math.max(...ownerEntries.map(e=>e[1]), 1);

  const bidding = RFQ_DATA.rfqs.filter(r=>r.status==='bidding').length;
  const won = RFQ_DATA.rfqs.filter(r=>r.status==='won').length;

  return `
    <div class="grid-tiles">
      <div class="card tile"><div class="n tabular">${INSIGHTS_DATA.total}</div><div class="l">Research clips</div></div>
      <div class="card tile"><div class="n tabular">${INSIGHTS_DATA.contributors}</div><div class="l">Research contributors</div></div>
      <div class="card tile"><div class="n tabular">${RFQ_DATA.rfqs.length}</div><div class="l">RFQs total</div></div>
      <div class="card tile"><div class="n tabular">${bidding}</div><div class="l">RFQs bidding</div></div>
      <div class="card tile"><div class="n tabular">${won}</div><div class="l">RFQs won</div></div>
    </div>

    <div class="dash-grid">
      <div>
        <div class="card panel">
          <h3>RFQs by status</h3>
          ${rfqByStatus.map(s=>`
            <div class="theme-bar-row">
              <div class="lbl">${esc(s.label)}</div>
              <div class="track"><div class="fill" style="width:${s.count/rfqMax*100}%"></div></div>
              <div class="val tabular">${s.count}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        <div class="card panel">
          <h3>Tasks by sector</h3>
          <p style="font-size:11.5px;color:var(--muted);margin:0 0 8px;">Reflects only tasks visible to you — personal tasks owned by others aren't counted.</p>
          ${sectorEntries.length===0 ? `<div class="empty">${ICONS.empty}<div>No tasks yet.</div></div>` : sectorEntries.map(([k,v])=>`
            <div class="theme-bar-row">
              <div class="lbl">${esc(k)}</div>
              <div class="track"><div class="fill" style="width:${v/sectorMax*100}%"></div></div>
              <div class="val tabular">${v}</div>
            </div>
          `).join('')}
        </div>

        <div class="card panel">
          <h3>Tasks by owner</h3>
          <p style="font-size:11.5px;color:var(--muted);margin:0 0 8px;">Same visibility caveat as above.</p>
          ${ownerEntries.length===0 ? `<div class="empty">${ICONS.empty}<div>No tasks yet.</div></div>` : ownerEntries.map(([k,v])=>`
            <div class="theme-bar-row">
              <div class="lbl">${esc(k)}</div>
              <div class="track"><div class="fill" style="width:${v/ownerMax*100}%"></div></div>
              <div class="val tabular">${v}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}
function bindInsightsControls(){
  if (!INSIGHTS_DATA.loaded) loadInsightsData();
}

/* ============================================================
   VIEW BINDING DISPATCH
   ============================================================ */
function bindView(){
  if (ui.view==='companies') bindCompaniesControls();
  if (ui.view==='contacts') bindContactsControls();
  if (ui.view==='tasks') bindTasksControls();
  if (ui.view==='solutions') bindSolutionsControls();
  if (ui.view==='create') bindCreateControls();
  if (ui.view==='rfqs') bindRfqsControls();
  if (ui.view==='insights') bindInsightsControls();
  if (ui.view==='competitors') bindCompetitorsControls();
  if (ui.view==='research') bindResearchControls();
  if (ui.view==='reports') bindReportsControls();
  if (ui.view==='events') bindEventsControls();
  if (ui.view==='settings') bindSettingsControls();
  if (ui.view==='dashboard'){
    document.querySelectorAll('[data-open-company]').forEach(el=>{
      el.addEventListener('click', ()=>{ if(el.dataset.openCompany) openDrawer(el.dataset.openCompany); });
    });
  }
}

/* ============================================================
   MODALS
   ============================================================ */
function openModal(html, onMount){
  const scrim = document.getElementById('modalScrim');
  const body = document.getElementById('modalBody');
  body.innerHTML = html;
  scrim.classList.add('open');
  scrim.onclick = (e)=>{ if(e.target===scrim) closeModal(); };
  if (onMount) onMount(body);
}
function closeModal(){ document.getElementById('modalScrim').classList.remove('open'); }

// Replaces window.confirm() — sandboxed artifact iframes commonly block native
// confirm/alert/prompt dialogs, which silently no-ops the whole action (this is
// exactly what broke "Remove account"). This runs entirely in-page instead.
function openConfirmModal(message, onConfirm, confirmLabel){
  openModal(`
    <h3>Are you sure?</h3>
    <p style="font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:4px;">${esc(message)}</p>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn" id="mConfirm" style="background:var(--critical);border-color:var(--critical);color:#fff;">${esc(confirmLabel||'Remove')}</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mConfirm').onclick = ()=>{ closeModal(); onConfirm(); };
  });
}

function openAddCompanyModal(){
  openModal(`
    <h3>New account</h3>
    <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">Starts personal — only you (and anyone you assign it to) can see it. Share it to General from the account drawer once it's ready for the team.</p>
    <div class="field"><label>Company name</label><input id="mName"></div>
    <div class="field"><label>Type</label><input id="mType" placeholder="e.g. Indigenous — Private E&P"></div>
    <div class="field"><label>Sector</label><input id="mSector" list="mSectorOptions" placeholder="e.g. Oil &amp; Gas — Upstream">${sectorDatalist('mSectorOptions')}</div>
    <div class="field"><label>Summary</label><textarea id="mSummary" placeholder="Short profile…"></textarea></div>
    <div class="field"><label>Priority</label><select id="mPriority">${PRIORITIES.map(p=>`<option value="${p}">${p}</option>`).join('')}</select></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add account</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const save = body.querySelector('#mSave'); save.disabled = true;
      const company = {
        id: crypto.randomUUID(), name, type: body.querySelector('#mType').value.trim()||'Uncategorised',
        sector: body.querySelector('#mSector').value.trim(),
        priority: body.querySelector('#mPriority').value, stage:'research',
        summary: body.querySelector('#mSummary').value.trim(),
        painPoints:[], currentSolutions:[],
      };
      try{
        const saved = await companiesApi.create(company);
        DATA.companies.push(saved);
        logActivity('Added an account', name); closeModal(); renderApp(); toast('Account added');
      }catch(e){ toast('Could not add account — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function openAddContactModal(companyId){
  const options = DATA.companies.map(c=>`<option value="${c.id}" ${c.id===companyId?'selected':''}>${esc(c.name)}</option>`).join('');
  openModal(`
    <h3>New contact</h3>
    <div class="field"><label>Company</label><select id="mCo">${options}</select></div>
    <div class="field"><label>Name</label><input id="mName"></div>
    <div class="field"><label>Position</label><input id="mPos"></div>
    <div class="field"><label>Email</label><input id="mEmail"></div>
    <div class="field"><label>Phone</label><input id="mPhone"></div>
    <div class="field"><label>LinkedIn (domain/path, no https://)</label><input id="mLi" placeholder="linkedin.com/in/…"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add contact</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const co = companyById(body.querySelector('#mCo').value);
      const name = body.querySelector('#mName').value.trim();
      if (!co || !name){ toast('Company and name required'); return; }
      const email = body.querySelector('#mEmail').value.trim();
      const linkedin = normalizeLinkedin(body.querySelector('#mLi').value);
      const { ok, errors } = validateChanged({email:''}, {email}, {email: emailRule});
      if (!ok){ toast(errors.email); return; }
      const ct = {
        id: crypto.randomUUID(), name,
        pos: body.querySelector('#mPos').value.trim(),
        email, phone: body.querySelector('#mPhone').value.trim(), linkedin,
        verified:false, lastContact:'', nextFollowUp:''
      };
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await contactsApi.create(co.id, ct);
        co.contacts.push(saved);
        logActivity('Added a contact', `${name} — ${co.name}`); closeModal(); renderApp();
        if (ui.drawerCompanyId===co.id) openDrawer(co.id);
        toast('Contact added');
      }catch(e){ toast('Could not add contact — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function openEditContactModal(contactId){
  const ct = findContact(contactId);
  if (!ct) return;
  const co = companyById(ct.companyId);
  openModal(`
    <h3>Edit contact</h3>
    <div class="field"><label>Company</label><input value="${esc(co?co.name:'')}" disabled></div>
    <div class="field"><label>Name</label><input id="mName" value="${esc(ct.name)}"></div>
    <div class="field"><label>Position</label><input id="mPos" value="${esc(ct.pos)}"></div>
    <div class="field"><label>Email</label><input id="mEmail" value="${esc(ct.email)}"></div>
    <div class="field"><label>Phone</label><input id="mPhone" value="${esc(ct.phone)}"></div>
    <div class="field"><label>LinkedIn</label><input id="mLi" value="${esc(ct.linkedin)}"></div>
    <div class="field"><label>Next follow-up</label><input type="date" id="mFollow" value="${ct.nextFollowUp||''}"></div>
    <div class="modal-actions">
      ${ct.email?`<button class="btn" id="mEmailBtn" style="margin-right:auto;">${ICONS.send} Draft email</button>`:''}
      <button class="btn btn-danger" id="mDelete" ${ct.email?'':'style="margin-right:auto;"'}>Delete</button>
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Save</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    const emailBtn = body.querySelector('#mEmailBtn');
    if (emailBtn) emailBtn.onclick = ()=>openEmailModal(ct.id);
    body.querySelector('#mDelete').onclick = ()=>{
      openConfirmModal('Delete this contact?', async ()=>{
        try{
          await contactsApi.remove(ct.id);
          co.contacts = co.contacts.filter(x=>x.id!==ct.id);
          closeModal(); renderApp();
          if (ui.drawerCompanyId===co.id) openDrawer(co.id);
          toast('Contact deleted');
        }catch(e){ toast('Could not delete — ' + (e.message || 'try again')); }
      });
    };
    body.querySelector('#mSave').onclick = async ()=>{
      const patch = {
        name: body.querySelector('#mName').value.trim(),
        pos: body.querySelector('#mPos').value.trim(),
        email: body.querySelector('#mEmail').value.trim(),
        phone: body.querySelector('#mPhone').value.trim(),
        linkedin: normalizeLinkedin(body.querySelector('#mLi').value),
        nextFollowUp: body.querySelector('#mFollow').value,
      };
      const { ok, errors } = validateChanged(ct, patch, { email: emailRule, linkedin: urlRule, nextFollowUp: dateRule });
      if (!ok){ toast(errors.email || errors.linkedin || errors.nextFollowUp); return; }
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await contactsApi.update(ct.id, patch);
        Object.assign(ct, saved);
        closeModal(); renderApp();
        if (ui.drawerCompanyId===co.id) openDrawer(co.id);
        toast('Contact saved');
      }catch(e){ toast('Could not save — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

// Drafts an email via a mailto: link — opens the viewer's own email client with
// the message pre-filled. Nothing is sent by this tool; there's no email-sending
// capability available (no connected email connector, and the sandbox blocks
// outbound network calls anyway), so this is the honest ceiling for "email" here.
function openEmailModal(contactId){
  const ct = findContact(contactId);
  if (!ct || !ct.email){ toast('No email on file for this contact'); return; }
  const co = companyById(ct.companyId);
  const firstName = (ct.name||'').split(' ')[0];
  const defaultSubject = co ? `Aerosub Solutions — ${co.name}` : 'Aerosub Solutions';
  const defaultBody = `Hi ${firstName},\n\nMy name is [your name] at Aerosub Solutions (aerosub.co) — ${BRAND.positioning}\n\n[Add your note here]\n\nBest regards,\n[your name]\nAerosub Solutions Limited`;
  openModal(`
    <h3>Draft email to ${esc(ct.name)}</h3>
    <div class="field"><label>To</label><input value="${esc(ct.email)}" disabled></div>
    <div class="field"><label>Subject</label><input id="mSubject" value="${esc(defaultSubject)}"></div>
    <div class="field"><label>Body</label><textarea id="mBody" style="min-height:160px;">${esc(defaultBody)}</textarea></div>
    <p style="font-size:10.8px;color:var(--muted);line-height:1.5;margin-bottom:4px;">Opens in your own email app — nothing is sent from here.</p>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mOpen">${ICONS.send} Open in email client</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mOpen').onclick = ()=>{
      const subject = encodeURIComponent(body.querySelector('#mSubject').value);
      const bodyText = encodeURIComponent(body.querySelector('#mBody').value);
      const mailto = `mailto:${encodeURIComponent(ct.email)}?subject=${subject}&body=${bodyText}`;
      window.open(mailto, '_blank');
      logActivity('Drafted an email', `${ct.name}${co?' ('+co.name+')':''}`);
      closeModal();
      toast('Opened in your email client');
    };
  });
}

function openAddTaskModal(companyId){
  const options = '<option value="">(No account)</option>' + DATA.companies.map(c=>`<option value="${c.id}" ${c.id===companyId?'selected':''}>${esc(c.name)}</option>`).join('');
  const todayIso = new Date().toISOString().slice(0,10);
  if (!TEAM_ROSTER.loaded) loadTeamRoster();
  const assigneeOptions = TEAM_ROSTER.members.filter(t=>t.id!==AUTH.profile?.id)
    .map(t=>`<option value="${t.id}">${esc(t.full_name||t.email)}</option>`).join('');
  openModal(`
    <h3>New action</h3>
    <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">Starts personal — only you (and anyone you assign it to) can see it. Share it to General later if the team should see it too.</p>
    <div class="field"><label>Title</label><input id="mTitle" placeholder="e.g. Follow up on LinkedIn message"></div>
    <div class="field"><label>Account</label><select id="mCo">${options}</select></div>
    <div class="field"><label>Due date</label><input type="date" id="mDue" value="${todayIso}"></div>
    <div class="field"><label>Priority</label><select id="mPriority">${PRIORITIES.map(p=>`<option value="${p}">${p}</option>`).join('')}</select></div>
    <div class="field"><label>Assign to (optional)</label><select id="mAssignee"><option value="">— just me —</option>${assigneeOptions}</select></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add action</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const title = body.querySelector('#mTitle').value.trim();
      if (!title){ toast('Title required'); return; }
      const task = {
        id: crypto.randomUUID(), title, companyId: body.querySelector('#mCo').value,
        due: body.querySelector('#mDue').value, priority: body.querySelector('#mPriority').value, done:false,
        assignedTo: body.querySelector('#mAssignee').value,
      };
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await tasksApi.create(task);
        DATA.tasks.push(saved);
        closeModal(); renderApp();
        if (ui.drawerCompanyId) openDrawer(ui.drawerCompanyId);
        toast('Action added');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function openAddSolutionModal(){
  const companyOptions = DATA.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const categoryOptions = DATA.settings.productCategories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  openModal(`
    <h3>New product / offer</h3>
    <div class="field"><label>Name</label><input id="mName" placeholder="e.g. Flare-Stack Thermal Survey"></div>
    <div class="field"><label>Category (Store)</label><select id="mCategory">${categoryOptions}</select></div>
    <div class="field"><label>Tag / display label</label><input id="mTag" placeholder="e.g. Aerial, Subsea, Data…"></div>
    <div class="field"><label>Kind</label><select id="mKind">${KIND_OPTIONS.map(k=>`<option value="${k}">${k}</option>`).join('')}</select></div>
    <div class="field"><label>Status</label><select id="mStatus">${STATUS_OPTIONS.filter(s=>s!=='Pending Review').map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
    <div class="field"><label>Vendor / OEM name (optional)</label><input id="mVendor"></div>
    <div class="field"><label><input type="checkbox" id="mOem"> OEM part</label></div>
    <div class="field"><label>Price (optional)</label><div class="row" style="gap:6px;"><input id="mPriceAmount" type="number" min="0" step="0.01" style="flex:1;"><select id="mPriceCurrency"><option value="NGN">NGN</option><option value="USD">USD</option></select></div></div>
    <div class="field"><label>Description</label><textarea id="mBlurb" placeholder="What it is and who it's for…"></textarea></div>
    <div class="field"><label>Tag to a client now (optional)</label><select id="mCo"><option value="">— none yet —</option>${companyOptions}</select></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add product</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const amountRaw = body.querySelector('#mPriceAmount').value;
      const product = {
        id: crypto.randomUUID(), name, tag: body.querySelector('#mTag').value.trim()||'General',
        categoryId: body.querySelector('#mCategory').value,
        kind: body.querySelector('#mKind').value, status: body.querySelector('#mStatus').value,
        vendorName: body.querySelector('#mVendor').value.trim(), oem: body.querySelector('#mOem').checked,
        priceAmount: amountRaw===''?null:Number(amountRaw), priceCurrency: body.querySelector('#mPriceCurrency').value,
        blurb: body.querySelector('#mBlurb').value.trim(), highlights:[],
      };
      const coId = body.querySelector('#mCo').value;
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await productsApi.create(product);
        DATA.solutions.push(saved);
        if (coId){
          const co = companyById(coId);
          if (co){
            await companiesApi.tagProduct(co.id, saved.id, 'Tagged at creation');
            co.recommended = co.recommended.filter(r=>r.sol!==saved.id);
            co.recommended.push({sol: saved.id, why: 'Tagged at creation'});
          }
        }
        closeModal(); renderApp(); toast('Product added');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

function openAddServiceModal(){
  const companyOptions = DATA.companies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const categoryOptions = DATA.settings.serviceCategories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  openModal(`
    <h3>New service</h3>
    <div class="field"><label>Name</label><input id="mName" placeholder="e.g. Crawler UT Survey"></div>
    <div class="field"><label>Category (Store)</label><select id="mCategory">${categoryOptions}</select></div>
    <div class="field"><label>Status</label><select id="mStatus">${STATUS_OPTIONS.filter(s=>s!=='Pending Review').map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
    <div class="field"><label>Price (optional)</label><div class="row" style="gap:6px;"><input id="mPriceAmount" type="number" min="0" step="0.01" style="flex:1;"><select id="mPriceCurrency"><option value="NGN">NGN</option><option value="USD">USD</option></select></div></div>
    <div class="field"><label>Description</label><textarea id="mBlurb" placeholder="What it is and who it's for…"></textarea></div>
    <div class="field"><label>Tag to a client now (optional)</label><select id="mCo"><option value="">— none yet —</option>${companyOptions}</select></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave">Add service</button>
    </div>
  `, body=>{
    body.querySelector('#mCancel').onclick = closeModal;
    body.querySelector('#mSave').onclick = async ()=>{
      const name = body.querySelector('#mName').value.trim();
      if (!name){ toast('Name required'); return; }
      const amountRaw = body.querySelector('#mPriceAmount').value;
      const service = {
        id: crypto.randomUUID(), name,
        categoryId: body.querySelector('#mCategory').value,
        status: body.querySelector('#mStatus').value,
        priceAmount: amountRaw===''?null:Number(amountRaw), priceCurrency: body.querySelector('#mPriceCurrency').value,
        blurb: body.querySelector('#mBlurb').value.trim(), highlights:[],
      };
      const coId = body.querySelector('#mCo').value;
      const save = body.querySelector('#mSave'); save.disabled = true;
      try{
        const saved = await servicesApi.create(service);
        DATA.services.push(saved);
        if (coId){
          const co = companyById(coId);
          if (co){
            await companiesApi.tagService(co.id, saved.id, 'Tagged at creation');
            co.recommendedServices = (co.recommendedServices||[]).filter(r=>r.svc!==saved.id);
            co.recommendedServices.push({svc: saved.id, why: 'Tagged at creation'});
          }
        }
        closeModal(); renderApp(); toast('Service added');
      }catch(e){ toast('Could not add — ' + (e.message || 'try again')); save.disabled = false; }
    };
  });
}

// Bulk upload (CSV only — see src/csv.js for why). Shared by products and
// services: kind is 'product' | 'service'. Expected header row: name,
// category, blurb, price, currency, and — products only — vendor, oem.
// `category` is matched case-insensitively against the Store's controlled
// taxonomy (PRD-v2 §Phase 0); a row whose category doesn't resolve is
// flagged, not guessed at.
function openBulkUploadModal(kind){
  const categories = kind==='service' ? DATA.settings.serviceCategories : DATA.settings.productCategories;
  const nounPlural = kind==='service' ? 'services' : 'products';
  openModal(`
    <h3>Bulk upload ${nounPlural}</h3>
    <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">
      CSV only — export/save your Excel sheet as .csv first. Header row required: <code>name, category, blurb, price, currency${kind==='product'?', vendor, oem':''}</code>.
      Every row lands as <b>Pending Review</b> — adjust status per item afterwards.
    </p>
    <div class="field"><input type="file" id="mFile" accept=".csv,text/csv"></div>
    <div id="mPreview"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn btn-primary" id="mSave" disabled>Import 0 rows</button>
    </div>
  `, body=>{
    let parsed = [];
    body.querySelector('#mCancel').onclick = closeModal;
    const saveBtn = body.querySelector('#mSave');
    const preview = body.querySelector('#mPreview');

    body.querySelector('#mFile').addEventListener('change', async e=>{
      const file = e.target.files[0]; if (!file) return;
      const text = await file.text();
      const rows = csvToObjects(text);
      parsed = rows.map(r=>{
        const name = (r.name||'').trim();
        const categoryNameRaw = (r.category||'').trim();
        const category = categories.find(c=>c.name.toLowerCase()===categoryNameRaw.toLowerCase());
        const errors = [];
        if (!name) errors.push('missing name');
        if (!category) errors.push(`unknown category "${categoryNameRaw}"`);
        const priceAmount = r.price ? Number(r.price) : null;
        if (r.price && Number.isNaN(priceAmount)) errors.push('invalid price');
        return {
          name, categoryId: category ? category.id : '',
          blurb: (r.blurb||'').trim(),
          priceAmount: Number.isNaN(priceAmount) ? null : priceAmount,
          priceCurrency: (r.currency||'NGN').trim().toUpperCase()==='USD' ? 'USD' : 'NGN',
          vendorName: (r.vendor||'').trim(),
          oem: /^(yes|true|1)$/i.test((r.oem||'').trim()),
          highlights: [],
          errors,
        };
      });
      const valid = parsed.filter(r=>r.errors.length===0);
      saveBtn.disabled = valid.length===0;
      saveBtn.textContent = `Import ${valid.length} row${valid.length===1?'':'s'}`;
      preview.innerHTML = `
        <div class="tablewrap" style="max-height:240px;overflow-y:auto;margin-top:10px;">
          <table>
            <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Status</th></tr></thead>
            <tbody>
              ${parsed.map(r=>`<tr>
                <td>${esc(r.name||'—')}</td>
                <td>${esc(categoryName(categories, r.categoryId)||'—')}</td>
                <td>${r.priceAmount!=null?esc(r.priceCurrency+' '+r.priceAmount):'—'}</td>
                <td>${r.errors.length ? `<span class="chip chip-high">${esc(r.errors.join('; '))}</span>` : `<span class="chip chip-good">ok</span>`}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="sub" style="margin-top:6px;">${parsed.length} row${parsed.length===1?'':'s'} parsed, ${valid.length} valid.</div>
      `;
    });

    saveBtn.onclick = async ()=>{
      const valid = parsed.filter(r=>r.errors.length===0).map(({errors, ...r})=>r);
      if (!valid.length) return;
      saveBtn.disabled = true;
      try{
        if (kind==='service'){
          const saved = await servicesApi.bulkCreate(valid);
          DATA.services.push(...saved);
        } else {
          const saved = await productsApi.bulkCreate(valid);
          DATA.solutions.push(...saved);
        }
        closeModal(); renderApp(); toast(`${valid.length} ${nounPlural} imported as Pending Review`);
      }catch(e){ toast('Could not import — ' + (e.message || 'try again')); saveBtn.disabled = false; }
    };
  });
}

/* ============================================================
   EXPORT
   D-6: every export is now a plain Blob + <a download> — the old
   claude.use('downloads') artifact-host path is gone from all 5 sites.
   D-9: the old "Import data (replace)" is gone — wholesale-replacing DATA
   from a JSON file can't safely wipe a shared Supabase DB from one client.
   Its replacement, an upsert-merge importer (PRD §10.6), is deferred
   alongside HT11. Export stays as a manual JSON snapshot (PRD §2).
   ============================================================ */
function downloadFile(filename, data, type){
  try{
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Exported ' + filename);
  }catch(e){ toast('Export failed — try again'); }
}
function doExport(){
  logActivity('Exported data (JSON backup)');
  const json = JSON.stringify(DATA, null, 2);
  downloadFile(`aerosub-pipeline-${new Date().toISOString().slice(0,10)}.json`, json, 'application/json');
}
/* ============================================================
   BOOT — kick off the auth flow (definitions above, PRD §5.5)
   ============================================================ */
initTheme();
boot();
