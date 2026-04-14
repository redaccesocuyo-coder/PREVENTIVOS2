// --- CONFIGURACIÓN ---
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

const TIPOS = {
    "PREVENTIVO":   { keyword: "interno",     col: 7, label: "Mantenimiento Interno" },
    "ALARMAS":      { keyword: "alarma",      col: 7, label: "Verificación de Alarmas" },
    "INVENTARIO":   { keyword: "inventario",  col: 7, label: "Inventario" },
    "TEST BATERÍA": { keyword: "test de bater",col: 7, label: "Test de Baterías" },
    "SETEO A/A":    { keyword: "interno",     col: 6, label: "Seteo A/A" },
};

const ESTADOS_SYTEX = {
    "ABIERTO":    { label: "ABIERTO",    class: "open" },
    "EN PROCESO": { label: "EN PROCESO", class: "in-progress" },
    "ENVIADO":    { label: "ENVIADO",    class: "done" },
    "APROBADO":   { label: "APROBADO",   class: "done" },
    "CANCELADO":  { label: "CANCELADO",  class: "pending" },
};

// --- ESTADO GLOBAL ---
let appData = {
    preventivos: [],
    sytex: {
        wos: {},
        seteo: {}
    },
    cellids: []
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
});

function initEventListeners() {
    const inputPrev = document.getElementById('input-preventivos');
    const inputSytex = document.getElementById('input-sytex');
    const searchInput = document.getElementById('search-input');

    inputPrev.addEventListener('change', (e) => handleFileUpload(e, 'preventivos'));
    inputSytex.addEventListener('change', (e) => handleFileUpload(e, 'sytex'));

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length >= 1) {
            renderSearchResults(query);
        } else {
            clearSiteDisplay();
        }
    });
}

// --- MANEJO DE ARCHIVOS ---
async function handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const label = document.getElementById(`info-${type}`);
    const statusBadge = document.getElementById(`${type}-status`);
    
    label.innerHTML = `<b>${file.name}</b> Cargando...`;
    
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (type === 'preventivos') {
            processPreventivos(rows);
            statusBadge.textContent = 'Excel: Cargado';
            statusBadge.className = 'badge success';
        } else {
            processSytex(rows);
            statusBadge.textContent = 'Sytex: Cargado';
            statusBadge.className = 'badge success';
        }

        label.innerHTML = `<b>${file.name}</b> ✔ OK`;
        updateUI();
        
    } catch (err) {
        console.error(err);
        label.innerHTML = `<b>${file.name}</b> ❌ Error`;
        statusBadge.className = 'badge error';
    }
}

// --- PROCESAMIENTO DE DATOS ---
function processPreventivos(rows) {
    // DATA_START_ROW = 11 en Python (index 10)
    const rawRows = rows.slice(10);
    appData.preventivos = rawRows.filter(r => r[1] || r[2]).map((r, i) => ({
        index: i + 11,
        wo: String(r[0] || '').trim(),
        cellid: String(r[1] || '').trim(),
        sitio: String(r[2] || '').trim(),
        seteo_aa: String(r[6] || '').trim(),
        terminado: String(r[7] || '').trim(),
        info: r[8]
    }));

    // Extraer CellIDs únicos
    appData.cellids = [...new Set(appData.preventivos.map(r => r.cellid))].sort();
}

function processSytex(rows) {
    const sytexRows = rows.slice(1);
    appData.sytex.wos = {};
    appData.sytex.seteo = {};

    sytexRows.forEach(row => {
        if (!row || row.length < 11) return;

        const fo = String(row[0] || '').trim();
        const desc = String(row[2] || '').trim().toUpperCase();
        const cellid = String(row[6] || '').trim();
        const wo = String(row[9] || '').trim();
        const raw_estado = String(row[10] || '').trim().toUpperCase();
        const enviado = row[23];
        const aprobado = row[33];
        const link = row[36] || '';

        // Lógica de estado igual al Python
        let estado = raw_estado;
        if (enviado && (estado === 'ABIERTO' || estado === 'EN PROCESO' || estado === '')) {
            estado = 'ENVIADO';
        }

        const info = {
            estado,
            fo,
            link,
            fecha: parseFecha(aprobado || enviado),
        };

        if (wo) appData.sytex.wos[wo] = info;
        
        if (desc.includes("SETEO DE AA") || desc.includes("SETEO A/A") || desc.includes("SETEO AA")) {
            if (cellid) appData.sytex.seteo[cellid] = info;
        }
    });
}

function parseFecha(val) {
    if (!val) return '';
    // SheetJS devuelve fechas como números seriales o Date objects
    if (val instanceof Date) return val.toLocaleDateString();
    if (typeof val === 'number') {
        const date = XLSX.utils.format_cell({ v: val, t: 'd' });
        return date;
    }
    return String(val);
}

// --- BUSQUEDA ---
function normalizeCellID(val) {
    return val.toUpperCase().replace(/^ME/, '').replace(/^0+/, '');
}

function renderSearchResults(query) {
    const qNorm = normalizeCellID(query);
    const matches = appData.cellids.filter(id => normalizeCellID(id).includes(qNorm));

    if (matches.length > 0) {
        // Por ahora, mostrar el primero o el exacto
        const exact = matches.find(id => normalizeCellID(id) === qNorm);
        displaySite(exact || matches[0]);
    } else {
        clearSiteDisplay();
    }
}

function displaySite(cellid) {
    const tasks = appData.preventivos.filter(r => r.cellid === cellid);
    if (!tasks.length) return;

    const header = document.getElementById('site-header');
    const list = document.getElementById('task-list');
    
    header.style.display = 'block';
    document.getElementById('active-cellid').textContent = `SITIO: ${cellid}`;
    document.getElementById('active-site-info').textContent = `${tasks.length} tareas encontradas`;

    list.innerHTML = '';
    
    // Agrupar tareas
    tasks.forEach(task => {
        // Tarea normal
        renderTaskCard(list, task, 'terminado');
        
        // Seteo AA si aplica
        if (task.sitio.toLowerCase().includes('interno') && (task.info === 0 || task.info === '0')) {
            renderTaskCard(list, task, 'seteo_aa');
        }
    });
}

function renderTaskCard(container, task, type) {
    const isSeteo = type === 'seteo_aa';
    const label = isSeteo ? "❄️ Seteo A/A" : getTaskLabel(task.sitio);
    const val = task[type];
    const isDone = !!(val && val.length > 0);

    // Obtener estado Sytex
    let sytexInfo = null;
    if (isSeteo) {
        sytexInfo = appData.sytex.seteo[task.cellid];
    } else {
        sytexInfo = appData.sytex.wos[task.wo];
    }

    const card = document.createElement('div');
    const sytexStatus = sytexInfo ? sytexInfo.estado : (isDone ? 'COMPLETADO' : 'PENDIENTE');
    const statusClass = sytexInfo ? (ESTADOS_SYTEX[sytexInfo.estado]?.class || 'pending') : (isDone ? 'done' : 'pending');

    card.className = `task-card ${statusClass}`;
    
    card.innerHTML = `
        <div class="task-content">
            <div class="task-main">
                <h3>${isDone ? '✅' : '🔴'} ${label}</h3>
                <div class="task-meta">WO: ${task.wo || '—'}</div>
            </div>
            <div class="task-status-wrapper" style="text-align: right">
                <div class="task-status">${sytexStatus}</div>
                ${sytexInfo ? `<div style="font-size: 0.75rem; color: var(--accent); cursor: pointer;" onclick="window.open('${sytexInfo.link}')">${sytexInfo.fo}</div>` : ''}
                ${sytexInfo?.fecha ? `<div style="font-size: 0.7rem; opacity: 0.6">${sytexInfo.fecha}</div>` : ''}
            </div>
        </div>
    `;

    container.appendChild(card);
}

function getTaskLabel(sitio) {
    const s = sitio.toLowerCase();
    if (s.includes('interno')) return "🔧 Mant. Interno";
    if (s.includes('alarma')) return "🚨 Verif. Alarmas";
    if (s.includes('inventario')) return "📦 Inventario";
    if (s.includes('test de bater')) return "🔋 Test Baterías";
    return sitio;
}

function clearSiteDisplay() {
    document.getElementById('site-header').style.display = 'none';
    document.getElementById('task-list').innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-dim);">Ingresá un CellID válido.</div>`;
}

// --- ACTUALIZACIÓN DE RESUMEN ---
function updateUI() {
    if (!appData.preventivos.length) return;
    
    document.getElementById('summary-card').style.display = 'block';
    const summary = calculateSummary();
    const tbody = document.getElementById('summary-body');
    tbody.innerHTML = '';

    let totalGlobal = 0;
    let hechoGlobal = 0;

    Object.entries(summary).forEach(([tipo, data]) => {
        const tr = document.createElement('tr');
        const hecho = Object.values(data.meses).reduce((a, b) => a + b, 0);
        
        totalGlobal += data.total;
        hechoGlobal += hecho;

        tr.innerHTML = `
            <td>${tipo}</td>
            <td class="total">${data.total}</td>
            <td class="completed">${hecho}</td>
        `;
        tbody.appendChild(tr);
    });

    const percent = totalGlobal > 0 ? Math.round((hechoGlobal / totalGlobal) * 100) : 0;
    document.getElementById('main-progress').style.width = `${percent}%`;
    document.getElementById('progress-text').textContent = `${percent}%`;
}

function calculateSummary() {
    const summary = {};
    Object.keys(TIPOS).forEach(t => {
        summary[t] = { total: 0, meses: {} };
    });

    appData.preventivos.forEach(r => {
        const sitioLower = r.sitio.toLowerCase();
        
        // Seteo AA
        if (sitioLower.includes('interno')) {
            if (r.info === 0 || r.info === '0') summary["SETEO A/A"].total++;
            if (MESES.includes(r.seteo_aa)) {
                summary["SETEO A/A"].meses[r.seteo_aa] = (summary["SETEO A/A"].meses[r.seteo_aa] || 0) + 1;
            }
        }

        // Resto
        for (const [tipo, cfg] of Object.entries(TIPOS)) {
            if (tipo === "SETEO A/A") continue;
            if (sitioLower.includes(cfg.keyword)) {
                summary[tipo].total++;
                if (MESES.includes(r.terminado)) {
                    summary[tipo].meses[r.terminado] = (summary[tipo].meses[r.terminado] || 0) + 1;
                }
            }
        }
    });

    return summary;
}
