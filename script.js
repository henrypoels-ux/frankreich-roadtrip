/**
 * Frankreich Roadtrip Planner v4
 * Punkt 1: automatische Route + km + Google-Maps-Link
 * Punkt 2: Stationen automatisch aus Tagen (keine doppelte Pflege)
 * Punkt 3: Vorbereitung für überall-Zugriff (Export/Import + GitHub-Pages-Anleitung im README)
 * Punkt 4: Feinschliff: Accordion-Animation, Next/Prev, Print/PDF
 */

const STORAGE_KEY = "fr-roadtrip-v4";
let state = null;
let selectedId = null;

function $(id){ return document.getElementById(id); }

const els = {
  tripTitle: $("tripTitle"),
  dayList: $("dayList"),
  editor: $("editor"),
  selectedMeta: $("selectedMeta"),
  addBtn: $("addBtn"),
  exportBtn: $("exportBtn"),
  importFile: $("importFile"),
  resetBtn: $("resetBtn"),
  printBtn: $("printBtn"),
  tabPlanner: $("tabPlanner"),
  tabView: $("tabView"),
  plannerView: $("plannerView"),
  publicView: $("publicView"),

  publicTitle: $("publicTitle"),
  publicIntro: $("publicIntro"),
  heroImg: $("heroImg"),
  stationsGrid: $("stationsGrid"),
  accordion: $("accordion"),
  bookAhead: $("bookAhead"),
  tips: $("tips"),
  costNote: $("costNote"),
  costCards: $("costCards"),
  costTotal: $("costTotal"),
  costFixed: $("costFixed"),
  sourceLink: $("sourceLink"),
  scrollStations: $("scrollStations"),
  scrollDays: $("scrollDays"),
  scrollRoute: $("scrollRoute"),

  mapFrame: $("mapFrame"),
  osmLink: $("osmLink"),
  gMapsLink: $("gMapsLink"),

  routeTotal: $("routeTotal"),
  routeLegCount: $("routeLegCount"),
  routeLegs: $("routeLegs"),
  openRouteBtn: $("openRouteBtn"),

  routeTotalPublic: $("routeTotalPublic"),
  routeLegsPublic: $("routeLegsPublic"),
  openRouteBtnPublic: $("openRouteBtnPublic"),
};

function uid(){
  return "day-" + Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function safeNum(v, fallback){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function eur(n){
  const v = safeNum(n, 0);
  return v.toLocaleString("de-DE", {style:"currency", currency:"EUR"});
}
function km(n){
  const v = safeNum(n, 0);
  return `${v.toFixed(0)} km`;
}
function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(parsed && Array.isArray(parsed.days)) return parsed;
  }catch(e){}
  return null;
}
function download(filename, text){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type:"application/json;charset=utf-8"}));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (s) => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[s]));
}
function escapeAttr(str){ return String(str).replace(/"/g, "&quot;"); }

function normalizeState(s){
  const out = {
    trip_title: String(s?.trip_title ?? "Frankreich Roadtrip"),
    hero_image: String(s?.hero_image ?? ""),
    source: s?.source ?? {url:"", title:""},
    // stations are optional; we auto-generate from days for display
    stations: Array.isArray(s?.stations) ? s.stations : [],
    days: Array.isArray(s?.days) ? s.days.map(d => ({
      id: String(d?.id ?? uid()),
      title: String(d?.title ?? ""),
      date: String(d?.date ?? ""),
      location: String(d?.location ?? ""),
      description: String(d?.description ?? ""),
      highlights: Array.isArray(d?.highlights) ? d.highlights.map(String) : [],
      image: String(d?.image ?? ""),
      coordinates: Array.isArray(d?.coordinates) && d.coordinates.length === 2
        ? [safeNum(d.coordinates[0], 0), safeNum(d.coordinates[1], 0)]
        : [0,0],
    })) : [],
    sections: s?.sections ?? { book_ahead:[], tips:[], costs:{items:[], per_person_total_eur:0, per_person_fixed_eur:0} }
  };
  return out;
}

function setTab(which){
  const isPlanner = which === "planner";
  els.tabPlanner.classList.toggle("active", isPlanner);
  els.tabView.classList.toggle("active", !isPlanner);
  els.plannerView.classList.toggle("active", isPlanner);
  els.publicView.classList.toggle("active", !isPlanner);
}
els.tabPlanner.addEventListener("click", () => setTab("planner"));
els.tabView.addEventListener("click", () => setTab("view"));

/* -------- Drag & Drop (native) -------- */
function onDragStart(e){
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(e.currentTarget.dataset.index));
}
function onDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
function onDrop(e){
  e.preventDefault();
  const toIndex = Number(e.currentTarget.dataset.index);
  const fromIndex = Number(e.dataTransfer.getData("text/plain"));
  if(!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) || fromIndex === toIndex) return;
  const moved = state.days.splice(fromIndex, 1)[0];
  state.days.splice(toIndex, 0, moved);
  save();
  renderAll();
}

/* -------- Map (iframe) -------- */
function updateMapForDay(d){
  const lat = safeNum(d?.coordinates?.[0], 46.5);
  const lng = safeNum(d?.coordinates?.[1], 2.5);
  const bbox = [lng-0.08, lat-0.05, lng+0.08, lat+0.05].join("%2C");
  const marker = `${lat}%2C${lng}`;
  els.mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
  els.osmLink.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=12/${lat}/${lng}`;
  els.gMapsLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
}

/* -------- Route (km + Google Maps link) -------- */
function haversineKm(a, b){
  const toRad = (x) => x * Math.PI / 180;
  const R = 6371; // km
  const lat1 = toRad(a[0]), lon1 = toRad(a[1]);
  const lat2 = toRad(b[0]), lon2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const s = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function buildLegs(days){
  const legs = [];
  for(let i=0;i<days.length-1;i++){
    const from = days[i], to = days[i+1];
    const k = haversineKm(from.coordinates, to.coordinates);
    legs.push({ i, fromId: from.id, toId: to.id, from, to, km: k });
  }
  return legs;
}

function buildGoogleMapsRouteLink(days){
  // Google Maps Directions: origin + destination + waypoints
  if(days.length < 2) return "https://www.google.com/maps";
  const fmt = (d) => `${safeNum(d.coordinates[0],0)},${safeNum(d.coordinates[1],0)}`;
  const origin = fmt(days[0]);
  const destination = fmt(days[days.length-1]);
  const waypoints = days.slice(1,-1).map(fmt).join("|");
  const base = "https://www.google.com/maps/dir/?api=1";
  const params = new URLSearchParams({
    origin,
    destination,
    travelmode: "driving",
  });
  if(waypoints) params.set("waypoints", waypoints);
  return `${base}&${params.toString()}`;
}

function renderRoute(){
  const days = state.days;
  const legs = buildLegs(days);
  const total = legs.reduce((s,x)=>s+x.km,0);

  els.routeTotal.textContent = km(total);
  els.routeLegCount.textContent = `${legs.length} Etappen`;

  els.routeLegs.innerHTML = legs.map(l => `
    <div class="leg" data-from="${escapeAttr(l.fromId)}" data-to="${escapeAttr(l.toId)}" title="Klicken: Ziel-Tag auswählen">
      <div class="legLeft">
        <div class="legTitle">${escapeHtml(l.from.title || "—")} → ${escapeHtml(l.to.title || "—")}</div>
        <div class="legMeta">${escapeHtml(l.from.location || "")} → ${escapeHtml(l.to.location || "")}</div>
      </div>
      <div class="legKm">${km(l.km)}</div>
    </div>
  `).join("");

  Array.from(els.routeLegs.querySelectorAll(".leg")).forEach(div => {
    div.addEventListener("click", () => {
      const toId = div.getAttribute("data-to");
      selectDay(toId);
    });
  });

  const link = buildGoogleMapsRouteLink(days);
  els.openRouteBtn.onclick = () => window.open(link, "_blank");

  // Public route
  els.routeTotalPublic.textContent = `Gesamt: ${km(total)} (Luftlinie)`;
  els.routeLegsPublic.innerHTML = legs.map(l => `
    <div class="legPublic">
      <div>
        <strong>${escapeHtml(l.from.title || "—")} → ${escapeHtml(l.to.title || "—")}</strong>
        <div class="metaLine">${escapeHtml(l.from.location || "")} → ${escapeHtml(l.to.location || "")}</div>
      </div>
      <div class="big">${km(l.km)}</div>
    </div>
  `).join("");
  els.openRouteBtnPublic.onclick = () => window.open(link, "_blank");
}

/* -------- Stationen automatisch aus Tagen -------- */
function deriveStationsFromDays(days){
  // group consecutive days by location (fallback: title if no location)
  const stations = [];
  let current = null;

  const pickName = (d) => (d.location && d.location.trim()) ? d.location.trim() : (d.title || "Station");

  for(const d of days){
    const name = pickName(d);
    if(!current || current.name !== name){
      current = {
        name,
        nights: 0,
        image: d.image || "",
        coordinates: d.coordinates,
        dayIds: [d.id],
      };
      stations.push(current);
    } else {
      current.dayIds.push(d.id);
      if(!current.image && d.image) current.image = d.image;
    }
    current.nights += 1; // simple: 1 day ~= 1 night (editierbar später)
  }

  // nicer label for nights
  stations.forEach(s => {
    s.nightsLabel = s.nights === 1 ? "1 Nacht" : `${s.nights} Nächte`;
  });

  return stations;
}

/* -------- Planner render -------- */
function renderList(){
  els.dayList.innerHTML = "";
  state.days.forEach((d, idx) => {
    const li = document.createElement("li");
    li.className = "dayItem" + (d.id === selectedId ? " active" : "");
    li.dataset.id = d.id;
    li.dataset.index = String(idx);
    li.draggable = true;

    const hls = (d.highlights || []).slice(0,3);
    const badgeHtml = hls.map(x => `<span class="badge">${escapeHtml(x)}</span>`).join("");

    li.innerHTML = `
      <div class="dragHandle" title="Ziehen">⠿</div>
      <div class="dayText">
        <p class="dayTitle">Tag ${idx+1}: ${escapeHtml(d.title || "—")}</p>
        <div class="daySub">${escapeHtml((d.location || "") + (d.date ? " • " + d.date : ""))}</div>
        <div class="badges">${badgeHtml}</div>
      </div>
    `;

    li.addEventListener("click", () => selectDay(d.id));
    li.addEventListener("dragstart", onDragStart);
    li.addEventListener("dragover", onDragOver);
    li.addEventListener("drop", onDrop);

    els.dayList.appendChild(li);
  });
}

function renderEditor(){
  const d = state.days.find(x => x.id === selectedId);
  if(!d){
    els.editor.classList.add("empty");
    els.editor.innerHTML = `
      <div class="emptyState">
        <h3>Tag auswählen</h3>
        <p>Klicke links einen Tag an, um Inhalte zu bearbeiten.</p>
      </div>
    `;
    els.selectedMeta.textContent = "";
    return;
  }

  els.editor.classList.remove("empty");
  const idx = state.days.findIndex(x => x.id === selectedId);
  els.selectedMeta.textContent = `Tag ${idx+1} • ID: ${d.id}`;

  const lat = safeNum(d.coordinates?.[0], 0);
  const lng = safeNum(d.coordinates?.[1], 0);

  els.editor.innerHTML = `
    <div class="formGrid">
      <div class="row">
        <div>
          <label>Titel</label>
          <input id="f_title" type="text" value="${escapeAttr(d.title)}" />
        </div>
        <div>
          <label>Ort / Region (steuert Stationen)</label>
          <input id="f_location" type="text" value="${escapeAttr(d.location)}" />
        </div>
      </div>

      <div class="row">
        <div>
          <label>Datum (optional)</label>
          <input id="f_date" type="text" value="${escapeAttr(d.date)}" placeholder="z.B. 12.07.2026" />
        </div>
        <div>
          <label>Bild-URL (optional)</label>
          <input id="f_image" type="text" value="${escapeAttr(d.image)}" placeholder="https://..." />
        </div>
      </div>

      <div>
        <label>Beschreibung</label>
        <textarea id="f_description" placeholder="Kurzbeschreibung">${escapeHtml(d.description)}</textarea>
      </div>

      <div class="row">
        <div>
          <label>Latitude</label>
          <input id="f_lat" type="number" step="0.000001" value="${lat}" />
        </div>
        <div>
          <label>Longitude</label>
          <input id="f_lng" type="number" step="0.000001" value="${lng}" />
        </div>
      </div>

      <div>
        <label>Highlights</label>
        <div class="hlWrap">
          <input id="hl_input" type="text" placeholder="Highlight hinzufügen (Enter)" />
          <button id="hl_add" class="btn small" type="button">Hinzufügen</button>
        </div>
        <div id="hl_list" class="hlList"></div>
      </div>

      <div class="preview" id="imgPreview" style="${d.image ? "" : "display:none"}">
        <img src="${escapeAttr(d.image)}" alt="Preview" onerror="this.closest('#imgPreview').style.display='none'"/>
      </div>

      <div class="editorActions">
        <button id="openMapBtn" class="btn small" type="button">Karte öffnen</button>
        <button id="deleteBtn" class="btn small danger" type="button">Tag löschen</button>
      </div>
    </div>
  `;

  const bind = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      d[key] = el.value;
      save();
      renderAll();
    });
  };

  bind("f_title", "title");
  bind("f_location", "location");
  bind("f_date", "date");
  bind("f_image", "image");

  document.getElementById("f_description").addEventListener("input", (e) => {
    d.description = e.target.value;
    save();
    renderAll();
  });

  document.getElementById("f_lat").addEventListener("input", (e) => {
    d.coordinates[0] = safeNum(e.target.value, d.coordinates[0]);
    save();
    renderAll();
  });
  document.getElementById("f_lng").addEventListener("input", (e) => {
    d.coordinates[1] = safeNum(e.target.value, d.coordinates[1]);
    save();
    renderAll();
  });

  const hlList = document.getElementById("hl_list");
  const redrawHighlights = () => {
    hlList.innerHTML = "";
    (d.highlights || []).forEach((h, i) => {
      const chip = document.createElement("div");
      chip.className = "hlChip";
      chip.innerHTML = `<span>${escapeHtml(h)}</span><button title="Entfernen" type="button">×</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        d.highlights.splice(i,1);
        save();
        renderAll();
      });
      hlList.appendChild(chip);
    });
  };
  redrawHighlights();

  const hlInput = document.getElementById("hl_input");
  const addHl = () => {
    const v = hlInput.value.trim();
    if(!v) return;
    d.highlights = d.highlights || [];
    d.highlights.push(v);
    hlInput.value = "";
    save();
    renderAll();
  };
  document.getElementById("hl_add").addEventListener("click", addHl);
  hlInput.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      addHl();
    }
  });

  document.getElementById("deleteBtn").addEventListener("click", () => {
    const idx = state.days.findIndex(x => x.id === selectedId);
    if(idx >= 0){
      state.days.splice(idx,1);
      selectedId = state.days[idx]?.id || state.days[idx-1]?.id || null;
      save();
      renderAll();
    }
  });

  document.getElementById("openMapBtn").addEventListener("click", () => {
    window.open(els.osmLink.href, "_blank");
  });
}

/* -------- Public render -------- */
function renderPublic(){
  els.publicTitle.textContent = state.trip_title || "Südfrankreich Roadtrip";
  els.publicIntro.textContent = "Vorbefüllt (zusammengefasst) und komplett editierbar im Tab „Plan“.";

  if(state.hero_image){
    els.heroImg.src = state.hero_image;
  } else if(state.days[0]?.image){
    els.heroImg.src = state.days[0].image;
  }

  const stations = deriveStationsFromDays(state.days);
  els.stationsGrid.innerHTML = "";
  stations.forEach((s) => {
    const card = document.createElement("div");
    card.className = "stationCard";
    card.innerHTML = `
      ${s.image ? `<img class="stationImg" src="${escapeAttr(s.image)}" alt="${escapeAttr(s.name)}" />` : ""}
      <div class="stationBody">
        <p class="stationName">${escapeHtml(s.name)}</p>
        <div class="stationMeta">${escapeHtml(s.nightsLabel)}</div>
      </div>
    `;
    card.addEventListener("click", () => {
      // jump to first day of station
      const firstId = s.dayIds?.[0];
      if(firstId){
        // open view, scroll to days, and open matching accordion item
        setTab("view");
        setTimeout(() => {
          document.getElementById("daysSection")?.scrollIntoView({behavior:"smooth"});
          openAccordionForDayId(firstId);
        }, 50);
      }
    });
    els.stationsGrid.appendChild(card);
  });

  els.accordion.innerHTML = "";
  state.days.forEach((d, idx) => {
    const item = document.createElement("div");
    item.className = "accItem";
    item.dataset.dayId = d.id;

    item.innerHTML = `
      <div class="accHead" role="button" aria-expanded="false" tabindex="0">
        <div class="accLeft">
          <div class="accTag">Tag ${idx+1}</div>
          <div style="min-width:0">
            <p class="accTitle">${escapeHtml(d.title || "—")}</p>
            <div class="accLoc">${escapeHtml(d.location || "")}${d.date ? " • " + escapeHtml(d.date) : ""}</div>
          </div>
        </div>
        <div class="accChevron">▾</div>
      </div>
      <div class="accBody">
        <div class="accBodyInner">
          <div class="accGrid">
            <div>
              ${d.image ? `<img class="accImg" src="${escapeAttr(d.image)}" alt="${escapeAttr(d.title)}" />` : ""}
            </div>
            <div class="accText">
              <p>${escapeHtml(d.description || "")}</p>
              <ul>${(d.highlights || []).map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
              <div class="accNav">
                <button class="btn small" data-prev type="button">← Zurück</button>
                <button class="btn small primary" data-next type="button">Weiter →</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const head = item.querySelector(".accHead");
    const body = item.querySelector(".accBody");
    const chevron = item.querySelector(".accChevron");

    const open = () => {
      closeAllAccordionsExcept(item);
      body.classList.add("open");
      head.setAttribute("aria-expanded", "true");
      chevron.textContent = "▴";
      chevron.style.transform = "rotate(180deg)";
    };
    const close = () => {
      body.classList.remove("open");
      head.setAttribute("aria-expanded", "false");
      chevron.textContent = "▾";
      chevron.style.transform = "rotate(0deg)";
    };
    const toggle = () => body.classList.contains("open") ? close() : open();

    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        toggle();
      }
    });

    item.querySelector("[data-prev]").addEventListener("click", () => {
      const prev = state.days[idx-1];
      if(prev){
        openAccordionForDayId(prev.id);
        item.scrollIntoView({behavior:"smooth", block:"start"});
      }
    });
    item.querySelector("[data-next]").addEventListener("click", () => {
      const nxt = state.days[idx+1];
      if(nxt){
        openAccordionForDayId(nxt.id);
        item.scrollIntoView({behavior:"smooth", block:"start"});
      }
    });

    els.accordion.appendChild(item);
  });

  els.bookAhead.innerHTML = (state.sections?.book_ahead || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");
  els.tips.innerHTML = (state.sections?.tips || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");

  const costs = state.sections?.costs || {};
  els.costNote.textContent = costs.note || "";
  els.costCards.innerHTML = (costs.items || []).map(it => `
    <div class="costCard">
      <div class="meta">${escapeHtml(it.label || "")}</div>
      <div style="font-weight:900">${eur(it.value_eur)}</div>
    </div>
  `).join("");
  els.costTotal.textContent = eur(costs.per_person_total_eur);
  els.costFixed.textContent = eur(costs.per_person_fixed_eur);

  const src = state.source?.url || "";
  els.sourceLink.textContent = state.source?.title || "traveloptimizer.de";
  els.sourceLink.href = src || "#";
}

function closeAllAccordionsExcept(keep){
  Array.from(els.accordion.querySelectorAll(".accItem")).forEach(item => {
    if(item === keep) return;
    const head = item.querySelector(".accHead");
    const body = item.querySelector(".accBody");
    const chevron = item.querySelector(".accChevron");
    body.classList.remove("open");
    head.setAttribute("aria-expanded", "false");
    chevron.textContent = "▾";
    chevron.style.transform = "rotate(0deg)";
  });
}

function openAccordionForDayId(dayId){
  const item = els.accordion.querySelector(`.accItem[data-day-id="${CSS.escape(dayId)}"]`);
  if(!item) return;
  const head = item.querySelector(".accHead");
  head.click();
}

function renderAll(){
  els.tripTitle.value = state.trip_title;
  renderList();
  renderEditor();
  renderPublic();
  renderRoute();

  const d = state.days.find(x => x.id === selectedId) || state.days[0];
  if(d) updateMapForDay(d);
}

function selectDay(id){
  selectedId = id;
  renderAll();
}

/* -------- Top actions -------- */
els.tripTitle.addEventListener("input", () => {
  state.trip_title = els.tripTitle.value;
  save();
  renderPublic();
});

els.addBtn.addEventListener("click", () => {
  const newDay = {
    id: uid(),
    title: "Neuer Tag",
    date: "",
    location: "",
    description: "",
    highlights: [],
    image: "",
    coordinates: [46.5, 2.5]
  };
  state.days.push(newDay);
  selectedId = newDay.id;
  save();
  renderAll();
});

els.exportBtn.addEventListener("click", () => {
  // include derived stations snapshot on export for convenience (still optional)
  const exportObj = structuredClone(state);
  exportObj.stations = deriveStationsFromDays(state.days).map(s => ({
    name: s.name,
    nights: s.nightsLabel,
    coordinates: s.coordinates,
    image: s.image
  }));
  download("roadtrip.export.json", JSON.stringify(exportObj, null, 2));
});

els.importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;
  const text = await file.text();
  try{
    state = normalizeState(JSON.parse(text));
    selectedId = state.days[0]?.id || null;
    save();
    renderAll();
  }catch(err){
    alert("Import fehlgeschlagen: ungültiges JSON");
  } finally {
    els.importFile.value = "";
  }
});

els.resetBtn.addEventListener("click", async () => {
  localStorage.removeItem(STORAGE_KEY);
  const initial = await loadInitial();
  state = normalizeState(initial);
  selectedId = state.days[0]?.id || null;
  save();
  renderAll();
});

els.printBtn.addEventListener("click", () => {
  setTab("view");
  setTimeout(() => window.print(), 50);
});

els.scrollStations?.addEventListener("click", () => {
  document.getElementById("stationsSection")?.scrollIntoView({behavior:"smooth"});
});
els.scrollDays?.addEventListener("click", () => {
  document.getElementById("daysSection")?.scrollIntoView({behavior:"smooth"});
});
els.scrollRoute?.addEventListener("click", () => {
  document.getElementById("routeSection")?.scrollIntoView({behavior:"smooth"});
});

/* -------- Load initial -------- */
async function loadInitial(){
  const stored = loadFromStorage();
  if(stored) return stored;
  const res = await fetch("data.json", {cache:"no-store"});
  return await res.json();
}

/* -------- Boot -------- */
(async function(){
  state = normalizeState(await loadInitial());
  if(!state.days.length){
    state.days = [{id: uid(), title:"Tag 1", date:"", location:"", description:"", highlights:[], image:"", coordinates:[46.5,2.5]}];
  }
  selectedId = state.days[0]?.id || null;
  save();
  renderAll();
})();

/* =========================
   Cloud Sync (Supabase)
   =========================
   Requirements (Supabase):
   - Table: trips
     columns:
       id uuid primary key default gen_random_uuid()
       owner uuid not null
       slug text not null
       data jsonb not null
       updated_at timestamptz not null default now()

   - Unique constraint: (owner, slug)
   - RLS on with policies:
       * SELECT: owner = auth.uid()
       * INSERT: owner = auth.uid()
       * UPDATE: owner = auth.uid()

   App flow:
   - User logs in (email/password) via Supabase Auth
   - "In Cloud speichern" upserts row (owner, slug) with data
   - "Aus Cloud laden" loads row and replaces local state
*/

const CLOUD = {
  modal: document.getElementById("cloudModal"),
  btn: document.getElementById("cloudBtn"),
  closeBtn: document.getElementById("cloudClose"),
  status: document.getElementById("cloudStatus"),
  sbUrl: document.getElementById("sbUrl"),
  sbAnon: document.getElementById("sbAnon"),
  email: document.getElementById("sbEmail"),
  pass: document.getElementById("sbPass"),
  slug: document.getElementById("tripSlug"),
  signup: document.getElementById("sbSignup"),
  login: document.getElementById("sbLogin"),
  logout: document.getElementById("sbLogout"),
  load: document.getElementById("cloudLoad"),
  save: document.getElementById("cloudSave"),
  auto: document.getElementById("cloudAuto"),
};

const CLOUD_STORE_KEY = "fr-roadtrip-cloud-v5";


function cloudGetConfig(){
  const c = window.APP_CONFIG || {};
  return {
    sbUrl: (c.SUPABASE_URL || "").trim(),
    sbAnon: (c.SUPABASE_ANON_KEY || "").trim(),
    slug: (c.TRIP_SLUG || "").trim(),
    autoloadPublic: !!c.AUTOLOAD_PUBLIC
  };
}

async function cloudPublicLoadIfConfigured(){
  const cfg = cloudGetConfig();
  if(!cfg.autoloadPublic) return false;
  if(!cfg.sbUrl || !cfg.sbAnon || !cfg.slug) return false;
  if(!window.supabase) return false;
  // Create client for public (no auth required)
  supa = window.supabase.createClient(cfg.sbUrl, cfg.sbAnon);
  try{
    const { data, error } = await supa
      .from("trips")
      .select("data,updated_at")
      .eq("slug", cfg.slug)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if(error || !data) return false;
    state = normalizeState(data.data);
    selectedId = state.days[0]?.id || null;
    save(); // local cache
    renderAll();
    cloudSetStatus("Auto-Load aktiv (geladen)", "ok");
    return true;
  }catch(e){
    return false;
  }
}
let supa = null;
let cloudAutoTimer = null;

function cloudSetStatus(text, kind){
  if(!CLOUD.status) return;
  CLOUD.status.textContent = text;
  CLOUD.status.classList.remove("ok","warn");
  if(kind) CLOUD.status.classList.add(kind);
}

function cloudOpen(){ CLOUD.modal.classList.remove("hidden"); }
function cloudClose(){ CLOUD.modal.classList.add("hidden"); }


function cloudLoadSettings(){
  try{
    const cfg = cloudGetConfig();
    if(cfg.sbUrl && !CLOUD.sbUrl.value) CLOUD.sbUrl.value = cfg.sbUrl;
    if(cfg.sbAnon && !CLOUD.sbAnon.value) CLOUD.sbAnon.value = cfg.sbAnon;
    if(cfg.slug && !CLOUD.slug.value) CLOUD.slug.value = cfg.slug;

    const raw = localStorage.getItem(CLOUD_STORE_KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    CLOUD.sbUrl.value = s.sbUrl || "";
    CLOUD.sbAnon.value = s.sbAnon || "";
    CLOUD.email.value = s.email || "";
    CLOUD.slug.value = s.slug || "";
    CLOUD.auto.checked = !!s.auto;
  }catch(e){}
}
function cloudSaveSettings(){
  const s = {
    sbUrl: CLOUD.sbUrl.value.trim(),
    sbAnon: CLOUD.sbAnon.value.trim(),
    email: CLOUD.email.value.trim(),
    slug: CLOUD.slug.value.trim(),
    auto: !!CLOUD.auto.checked,
  };
  localStorage.setItem(CLOUD_STORE_KEY, JSON.stringify(s));
}

function cloudEnsureClient(){
  const sbUrl = CLOUD.sbUrl.value.trim();
  const sbAnon = CLOUD.sbAnon.value.trim();
  if(!sbUrl || !sbAnon){
    cloudSetStatus("URL/anon key fehlt", "warn");
    return null;
  }
  if(!window.supabase){
    cloudSetStatus("Supabase SDK nicht geladen", "warn");
    return null;
  }
  // create fresh client each time to match potentially changed config
  supa = window.supabase.createClient(sbUrl, sbAnon);
  return supa;
}

async function cloudRefreshSessionStatus(){
  const client = cloudEnsureClient();
  if(!client) return;
  const { data: { session } } = await client.auth.getSession();
  if(session?.user){
    cloudSetStatus("eingeloggt: " + (session.user.email || "User"), "ok");
  } else {
    cloudSetStatus("nicht eingeloggt", "warn");
  }
}

async function cloudSignup(){
  cloudSaveSettings();
  const client = cloudEnsureClient();
  if(!client) return;

  const email = CLOUD.email.value.trim();
  const password = CLOUD.pass.value;
  if(!email || !password){
    cloudSetStatus("E-Mail/Passwort fehlt", "warn");
    return;
  }

  const { error } = await client.auth.signUp({ email, password });
  if(error){
    cloudSetStatus("Signup fehlgeschlagen: " + error.message, "warn");
  } else {
    cloudSetStatus("Registriert. Falls Bestätigung nötig: E-Mail prüfen.", "ok");
  }
}

async function cloudLogin(){
  cloudSaveSettings();
  const client = cloudEnsureClient();
  if(!client) return;

  const email = CLOUD.email.value.trim();
  const password = CLOUD.pass.value;
  if(!email || !password){
    cloudSetStatus("E-Mail/Passwort fehlt", "warn");
    return;
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if(error){
    cloudSetStatus("Login fehlgeschlagen: " + error.message, "warn");
  } else {
    await cloudRefreshSessionStatus();
  }
}

async function cloudLogout(){
  const client = cloudEnsureClient();
  if(!client) return;
  await client.auth.signOut();
  cloudSetStatus("nicht eingeloggt", "warn");
}

async function cloudSaveNow(){
  cloudSaveSettings();
  const client = cloudEnsureClient();
  if(!client) return;

  const slug = CLOUD.slug.value.trim();
  if(!slug){
    cloudSetStatus("Trip-ID fehlt", "warn");
    return;
  }

  const { data: { session } } = await client.auth.getSession();
  if(!session?.user){
    cloudSetStatus("Bitte erst einloggen", "warn");
    return;
  }

  const payload = {
    owner: session.user.id,
    slug,
    data: state,
    updated_at: new Date().toISOString(),
  };

  // Upsert on (owner, slug)
  const { error } = await client
    .from("trips")
    .upsert(payload, { onConflict: "owner,slug" });

  if(error){
    cloudSetStatus("Speichern fehlgeschlagen: " + error.message, "warn");
  } else {
    cloudSetStatus("Gespeichert (" + new Date().toLocaleTimeString("de-DE") + ")", "ok");
  }
}

async function cloudLoadNow(){
  cloudSaveSettings();
  const client = cloudEnsureClient();
  if(!client) return;

  const slug = CLOUD.slug.value.trim();
  if(!slug){
    cloudSetStatus("Trip-ID fehlt", "warn");
    return;
  }

  const { data: { session } } = await client.auth.getSession();
  if(!session?.user){
    cloudSetStatus("Bitte erst einloggen", "warn");
    return;
  }

  const { data, error } = await client
    .from("trips")
    .select("data,updated_at")
    .eq("owner", session.user.id)
    .eq("slug", slug)
    .maybeSingle();

  if(error){
    cloudSetStatus("Laden fehlgeschlagen: " + error.message, "warn");
    return;
  }
  if(!data){
    cloudSetStatus("Kein Trip gefunden (Trip-ID korrekt?)", "warn");
    return;
  }

  state = normalizeState(data.data);
  selectedId = state.days[0]?.id || null;
  save(); // local storage
  renderAll();
  cloudSetStatus("Geladen (" + new Date(data.updated_at).toLocaleString("de-DE") + ")", "ok");
}

function cloudScheduleAutoSave(){
  if(!CLOUD.auto.checked) return;
  // debounce: 1.2s after last change
  if(cloudAutoTimer) clearTimeout(cloudAutoTimer);
  cloudAutoTimer = setTimeout(() => {
    cloudSaveNow();
  }, 1200);
}

/* Hook into existing save() calls by wrapping the global save function */
const _save_original = save;
save = function(){
  _save_original();
  cloudScheduleAutoSave();
};

// UI wiring
if(CLOUD.btn){
  CLOUD.btn.addEventListener("click", async () => {
    cloudOpen();
    cloudLoadSettings();

// Auto-Load für Read-only Geräte (z.B. Handy)
cloudPublicLoadIfConfigured();
    await cloudRefreshSessionStatus();
  });
}
if(CLOUD.closeBtn) CLOUD.closeBtn.addEventListener("click", cloudClose);
if(CLOUD.modal){
  CLOUD.modal.addEventListener("click", (e) => {
    if(e.target && e.target.hasAttribute("data-close")) cloudClose();
  });
  document.addEventListener("keydown", (e) => {
    if(!CLOUD.modal.classList.contains("hidden") && e.key === "Escape") cloudClose();
  });
}
if(CLOUD.signup) CLOUD.signup.addEventListener("click", cloudSignup);
if(CLOUD.login) CLOUD.login.addEventListener("click", cloudLogin);
if(CLOUD.logout) CLOUD.logout.addEventListener("click", cloudLogout);
if(CLOUD.save) CLOUD.save.addEventListener("click", cloudSaveNow);
if(CLOUD.load) CLOUD.load.addEventListener("click", cloudLoadNow);
if(CLOUD.auto) CLOUD.auto.addEventListener("change", () => {
  cloudSaveSettings();
  if(CLOUD.auto.checked){
    cloudSetStatus("Auto-Sync aktiv (speichert bei Änderungen)", "ok");
  } else {
    cloudSetStatus("Auto-Sync aus", "warn");
  }
});

cloudLoadSettings();

// Auto-Load für Read-only Geräte (z.B. Handy)
cloudPublicLoadIfConfigured();
