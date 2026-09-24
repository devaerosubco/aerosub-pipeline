// STORE VIEW (V2 HT-B/C) — Dashboard / Product / Service sub-tabs, the
// product/service drawers, and members-only sharing, split out of main.js
// (where every other view still lives) as the first slice of that file into
// per-view modules. main.js is a single-file, no-framework app with no
// dependency-injection layer, so this module leans on a handful of things
// re-exported from main.js (DATA/ui/AUTH state, generic modal/toast/drawer
// helpers, and the couple of lookups — companyById/solutionById/serviceById —
// that the Company drawer and Reports also need). Everything below this
// import block is Store-only: nothing outside this file calls it except the
// small set re-exported at the bottom, which main.js imports back.
import * as productsApi from '../api/products.js';
import * as servicesApi from '../api/services.js';
import * as companiesApi from '../api/companies.js';
import * as storeSharesApi from '../api/storeShares.js';
import { listProfiles } from '../auth.js';
import { uploadFile, signedUrl, removeFile } from '../storage.js';
import { csvToObjects } from '../csv.js';
import {
  DATA, ui, AUTH,
  esc, toast, fmtDate, ICONS,
  openModal, closeModal, openConfirmModal, downloadFile,
  companyById, solutionById, serviceById,
  renderApp, renderView,
  openLinkModal, closeDrawer, openDrawer, logActivity,
  openProductDrawer, openServiceDrawer,
} from '../main.js';

// Store sharing (V2 HT-C) — loaded lazily on first Store visit, same pattern
// as SETTINGS in main.js. sharedWithMe drives the "Shared with me" filter.
const STORE_SHARES = { sharedWithMe: [], loaded: false, loading: false };
function loadStoreShares(){
  if (STORE_SHARES.loading || !AUTH.profile) return;
  STORE_SHARES.loading = true;
  storeSharesApi.listSharedWithMe(AUTH.profile.id)
    .then(rows=>{ STORE_SHARES.sharedWithMe = rows; STORE_SHARES.loaded = true; })
    .catch(()=>{})
    .finally(()=>{ STORE_SHARES.loading = false; if (ui.view==='solutions') renderView(); });
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

// enterApp() (main.js) calls this on every fresh sign-in so a second account
// signing in on the same browser session doesn't see a previous user's
// share/teammate cache — same reason it resets SETTINGS.loaded too.
export function resetStoreCaches(){
  STORE_SHARES.loaded = false;
  ITEM_SHARE.key = null;
}

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
            const mine = sh.shared_by===AUTH.profile.id;
            const who = teammates.find(t=>t.id=== (mine ? sh.shared_with : sh.shared_by));
            const label = mine ? esc(who?(who.full_name||who.email):'Unknown') : `Shared with you by ${esc(who?(who.full_name||who.email):'someone')}`;
            return `<div class="bullet solution"><span style="flex:1;">${label}</span>${mine?`<button class="x" data-revoke-share="${sh.id}">${ICONS.x}</button>`:''}</div>`;
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

export function renderProductDrawer(){
  const p = solutionById(ui.drawerProductId);
  const drawer = document.getElementById('drawer');
  if (!p){ drawer.innerHTML=''; return; }
  const tagged = taggedCompaniesFor(p.id);
  const untagged = untaggedCompaniesFor(p.id);
  const highlights = p.highlights || [];

  drawer.innerHTML = `
    <button class="drawer-close" id="drawerCloseBtn" aria-label="Close">${ICONS.x}</button>
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
            highlights.map((h,i)=>`<div class="bullet solution"><span>${esc(h)}</span><button class="x" data-del-hl="${i}" aria-label="Remove highlight: ${esc(h)}">${ICONS.x}</button></div>`).join('')}
        </div>
        <div class="add-inline"><input id="newHl" placeholder="Add a highlight or capability…"><button class="btn btn-sm" id="addHlBtn" aria-label="Add highlight">${ICONS.plus}</button></div>
      </div>

      <div class="dsec">
        <div class="dsec-head"><h4>Tagged clients (${tagged.length})</h4></div>
        ${tagged.length===0 ? `<div class="empty" style="padding:16px;">${ICONS.empty}<div>Not tagged to any account yet.</div></div>` :
          tagged.map(row=>`
            <div class="rec-card">
              <div class="row" style="justify-content:space-between;">
                <div class="rname" data-open-company="${row.company.id}" style="cursor:pointer;">${esc(row.company.name)}</div>
                <button class="x" data-untag="${row.company.id}" aria-label="Untag from ${esc(row.company.name)}" style="background:none;border:none;color:var(--teal-strong);cursor:pointer;">${ICONS.x}</button>
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
export function renderServiceDrawer(){
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

export function renderSolutions(){
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

// Runs an async per-item action across a bulk-selected list and reports how
// many actually succeeded — a plain per-item try/catch that swallowed errors
// silently used to report "Archived"/"Deleted" etc. even when some items
// failed (e.g. a stale session mid-loop), which is worse than not saying
// anything: it tells the user something happened when it didn't.
async function bulkRun(items, fn){
  let ok = 0, failed = 0;
  for (const it of items){
    try{ await fn(it); ok++; }
    catch(e){ failed++; }
  }
  return { ok, failed, total: items.length };
}
function bulkToast(verb, { ok, failed, total }){
  if (failed === 0) toast(`${verb} ${total}`);
  else toast(`${verb} ${ok} of ${total} — ${failed} failed, try again`);
}

export function bindSolutionsControls(){
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
    const result = await bulkRun(selectedItems(), async it=>{ await api.archive(it.id); it.archivedAt = new Date().toISOString(); });
    ui.storeSelected.clear(); renderView(); bulkToast('Archived', result);
  });
  const unarchiveBtn = document.getElementById('storeBulkUnarchiveBtn');
  if (unarchiveBtn) unarchiveBtn.addEventListener('click', async ()=>{
    const result = await bulkRun(selectedItems(), async it=>{ await api.unarchive(it.id); it.archivedAt = ''; });
    ui.storeSelected.clear(); renderView(); bulkToast('Unarchived', result);
  });
  const quoteBtn = document.getElementById('storeBulkQuoteBtn');
  if (quoteBtn) quoteBtn.addEventListener('click', async ()=>{
    const result = await bulkRun(selectedItems(), async it=>{
      await api.incrementAddedToQuoteCount(it.id, it.addedToQuoteCount); it.addedToQuoteCount = (it.addedToQuoteCount||0)+1;
    });
    ui.storeSelected.clear(); renderView();
    bulkToast('Added to quote count for', result);
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
      const result = await bulkRun(items, async it=>{
        await api.remove(it.id);
        if (kind==='product'){
          DATA.companies.forEach(c=>{ c.recommended = c.recommended.filter(r=>r.sol!==it.id); });
          DATA.solutions = DATA.solutions.filter(x=>x.id!==it.id);
        } else {
          DATA.companies.forEach(c=>{ c.recommendedServices = (c.recommendedServices||[]).filter(r=>r.svc!==it.id); });
          DATA.services = DATA.services.filter(x=>x.id!==it.id);
        }
      });
      ui.storeSelected.clear(); renderApp(); bulkToast('Deleted', result);
    });
  });
  const clearBtn = document.getElementById('storeBulkClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', ()=>{ ui.storeSelected.clear(); renderView(); });
}

export function openAddSolutionModal(){
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

export function openAddServiceModal(){
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
export function openBulkUploadModal(kind){
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
        if (r.price && (Number.isNaN(priceAmount) || priceAmount < 0)) errors.push('invalid price');
        const blurb = (r.blurb||'').trim();
        if (blurb.length > 4000) errors.push(`blurb too long (${blurb.length}/4000)`);
        const vendorName = (r.vendor||'').trim();
        if (kind==='product' && vendorName.length > 200) errors.push(`vendor too long (${vendorName.length}/200)`);
        return {
          name, categoryId: category ? category.id : '',
          blurb,
          priceAmount: Number.isNaN(priceAmount) ? null : priceAmount,
          priceCurrency: (r.currency||'NGN').trim().toUpperCase()==='USD' ? 'USD' : 'NGN',
          vendorName,
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

// A Store "Copy link" (V2 HT-C) lands here as ?store=product:<id> or
// ?store=service:<id> — members-only: this is a deep link, not a new grant
// (every member can already read every item), and it silently no-ops if the
// item doesn't resolve (deleted, or a malformed param).
export function openStoreShareLink(param){
  const [kind, id] = String(param).split(':');
  if (kind!=='product' && kind!=='service') return;
  if (!storeItemById(kind, id)) return;
  ui.view = 'solutions'; ui.storeTab = kind==='service' ? 'services' : 'products';
  renderApp();
  storeKindOpen(kind, id);
}
