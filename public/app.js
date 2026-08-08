// State variables
let leads = [];
let logs = [];

// DOM Elements
const totalLeadsEl = document.getElementById('stat-total-leads');
const contactedRateEl = document.getElementById('stat-contacted-rate');
const contactedCountEl = document.getElementById('stat-contacted-count');
const closedWonEl = document.getElementById('stat-closed-won');
const closedWonPctEl = document.getElementById('stat-closed-won-pct');
const pipelineValueEl = document.getElementById('stat-pipeline-value');
const logsListEl = document.getElementById('logs-list');

const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const leadModal = document.getElementById('lead-modal');
const ingestForm = document.getElementById('ingest-form');
const refreshBtn = document.getElementById('refresh-btn');
const exportBtn = document.getElementById('export-btn');

// Tab Navigation References
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// Contacts Directory References
const contactsTbody = document.getElementById('contacts-tbody');
const contactSearchInput = document.getElementById('contact-search-input');
const contactFilterStage = document.getElementById('contact-filter-stage');

// Location Filter References
const filterCountry = document.getElementById('filter-country');
const filterState = document.getElementById('filter-state');
const filterCity = document.getElementById('filter-city');
const clearLocationBtn = document.getElementById('clear-location-btn');

// Inventory Manager References
let inventory = [];
let editInventoryId = null;
let editLeadId = null;
const inventoryTbody = document.getElementById('inventory-tbody');
const inventoryFilterCategory = document.getElementById('inventory-filter-category');
const openInvModalBtn = document.getElementById('open-inv-modal-btn');
const closeInvModalBtn = document.getElementById('close-inv-modal-btn');
const cancelInvModalBtn = document.getElementById('cancel-inv-modal-btn');
const inventoryModal = document.getElementById('inventory-modal');
const inventoryForm = document.getElementById('inventory-form');

// Pipeline column configs
const STAGES = ['new', 'contacted', 'estimate_scheduled', 'closed_won', 'closed_lost'];
const COLUMNS = {};
STAGES.forEach(stage => {
  COLUMNS[stage] = {
    count: document.getElementById(`count-${stage}`),
    container: document.getElementById(`cards-${stage}`)
  };
});

const locationPresets = {
  PH: { state: 'Metro Manila', city: 'Pasig City', utility: 'Meralco' },
  US: { state: 'California', city: 'Los Angeles', utility: 'PG&E' },
  GB: { state: 'England', city: 'London', utility: 'British Gas' },
  AU: { state: 'New South Wales', city: 'Sydney', utility: 'Origin Energy' },
  CA: { state: 'Ontario', city: 'Toronto', utility: 'Hydro One' },
  DE: { state: 'Bavaria', city: 'Munich', utility: 'E.ON' }
};

// Event Listeners
if (closeModalBtn) closeModalBtn.addEventListener('click', () => toggleModal(false));
if (cancelModalBtn) cancelModalBtn.addEventListener('click', () => toggleModal(false));
if (refreshBtn) refreshBtn.addEventListener('click', loadData);

// Exporter event listener
exportBtn.addEventListener('click', () => {
  if (leads.length === 0) {
    alert('No lead records available to export.');
    return;
  }

  const headers = ['ID', 'Date Created', 'Full Name', 'Phone', 'Email', 'Service Type', 'Monthly Bill ($)', 'Pipeline Stage'];
  
  const csvRows = [
    headers.join(','),
    ...leads.map(lead => [
      lead.id,
      lead.created_at,
      `"${lead.full_name.replace(/"/g, '""')}"`,
      lead.phone,
      lead.email || '',
      lead.service_type || '',
      lead.monthly_bill || '',
      lead.pipeline_stage
    ].join(','))
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `apex_leads_export_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Modal Wizard State & Configs
let modalCurrentStep = 1;
const modalTotalSteps = 4;

const modalFormData = {
  property_type: 'residential',
  ownership_status: 'own',
  currency: 'PHP',
  monthly_bill: 7500,
  roof_type: 'metal',
  primary_goal: 'lower_bills',
  attachments: {}
};

const CURRENCY_CONFIGS = {
  PHP: {
    symbol: '₱',
    ranges: [
      { text: 'Under ₱5,000', val: 3000 },
      { text: '₱5,000–₱10,000', val: 7500, default: true },
      { text: '₱10,001–₱15,000', val: 12500 },
      { text: '₱15,000+', val: 20000 }
    ]
  },
  USD: {
    symbol: '$',
    ranges: [
      { text: 'Under $100', val: 80 },
      { text: '$100–$250', val: 180, default: true },
      { text: '$251–$400', val: 320 },
      { text: '$400+', val: 500 }
    ]
  },
  EUR: {
    symbol: '€',
    ranges: [
      { text: 'Under €80', val: 60 },
      { text: '€80–€200', val: 140, default: true },
      { text: '€201–€350', val: 280 },
      { text: '€350+', val: 450 }
    ]
  },
  GBP: {
    symbol: '£',
    ranges: [
      { text: 'Under £60', val: 50 },
      { text: '£60–£180', val: 120, default: true },
      { text: '£181–£300', val: 240 },
      { text: '£300+', val: 400 }
    ]
  },
  AUD: {
    symbol: '$',
    ranges: [
      { text: 'Under $150', val: 100 },
      { text: '$150–$300', val: 220, default: true },
      { text: '$301–$500', val: 400 },
      { text: '$500+', val: 650 }
    ]
  },
  CAD: {
    symbol: '$',
    ranges: [
      { text: 'Under $120', val: 90 },
      { text: '$120–$280', val: 200, default: true },
      { text: '$281–$450', val: 365 },
      { text: '$450+', val: 600 }
    ]
  }
};

const modalCountrySelect = document.getElementById('modal-country-select');
const modalStateInput = document.getElementById('modal-state-input');
const modalCityInput = document.getElementById('modal-city-input');
const modalUtilityInput = document.getElementById('modal-utility-input');
const modalStreetInput = document.getElementById('modal-street-input');

const modalProgressFill = document.getElementById('modal-progress-fill');
const modalStepDesc = document.getElementById('modal-step-desc');
const modalPrevBtn = document.getElementById('modal-prev-btn');
const modalNextBtn = document.getElementById('modal-next-btn');
const modalCurrencySelector = document.getElementById('modal-currency-selector');
const modalBillLabel = document.getElementById('modal-bill-label');
const modalBillGrid = document.getElementById('modal-bill-range-grid');

const modalLbls = [
  document.getElementById('modal-lbl-1'),
  document.getElementById('modal-lbl-2'),
  document.getElementById('modal-lbl-3'),
  document.getElementById('modal-lbl-4')
];

function updateModalCurrencyRanges() {
  const config = CURRENCY_CONFIGS[modalFormData.currency];
  modalBillLabel.textContent = `Average Monthly Electric Bill (${config.symbol})`;
  modalBillGrid.innerHTML = '';
  
  config.ranges.forEach((r) => {
    const option = document.createElement('div');
    option.className = `option-card ${r.default ? 'selected' : ''}`;
    option.innerHTML = `
      <div style="font-size: 16px; margin-bottom: 2px;">📈</div>
      <h4>${r.text}</h4>
    `;
    if (r.default) {
      modalFormData.monthly_bill = r.val;
    }
    
    option.addEventListener('click', () => {
      modalBillGrid.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      option.classList.add('selected');
      modalFormData.monthly_bill = r.val;
    });
    
    modalBillGrid.appendChild(option);
  });
}

// Reset and Open Modal Form
openModalBtn.addEventListener('click', () => {
  modalCurrentStep = 1;
  goToModalStep(1);
  ingestForm.reset();
  
  modalFormData.property_type = 'residential';
  modalFormData.ownership_status = 'own';
  modalFormData.currency = 'PHP';
  modalFormData.roof_type = 'metal';
  modalFormData.primary_goal = 'lower_bills';
  modalFormData.attachments = {};
  
  modalCurrencySelector.value = 'PHP';
  updateModalCurrencyRanges();

  // Reset location inputs
  if (modalCountrySelect) {
    modalCountrySelect.value = 'PH';
    applyModalLocationPresets('PH');
  }
  
  // Clear badges
  modalFileInputs.forEach(inputId => {
    document.getElementById(`badge-${inputId}`).style.display = 'none';
  });
  
  // Reset option cards selected states
  document.querySelectorAll('#lead-modal .option-card').forEach(card => {
    const field = card.getAttribute('data-field');
    const val = card.getAttribute('data-value');
    if (val === 'residential' || val === 'own' || val === 'metal' || val === 'lower_bills') {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
  
  toggleModal(true);
});

// Selector mapping
modalCurrencySelector.addEventListener('change', (e) => {
  modalFormData.currency = e.target.value;
  updateModalCurrencyRanges();
});

if (modalCountrySelect) {
  modalCountrySelect.addEventListener('change', (e) => applyModalLocationPresets(e.target.value));
}

function applyModalLocationPresets(code) {
  const preset = locationPresets[code];
  if (preset) {
    modalStateInput.value = preset.state;
    modalCityInput.value = preset.city;
    modalUtilityInput.value = preset.utility;
  }
}

// Click listener on option cards
document.querySelectorAll('#lead-modal .option-card').forEach(card => {
  const field = card.getAttribute('data-field');
  if (!field || !field.startsWith('modal_')) return;
  
  card.addEventListener('click', () => {
    document.querySelectorAll(`.option-card[data-field="${field}"]`).forEach(sibling => {
      sibling.classList.remove('selected');
    });
    card.classList.add('selected');
    const cleanField = field.replace('modal_', '');
    modalFormData[cleanField] = card.getAttribute('data-value');
  });
});

// File changes
const modalFileInputs = ['modal-doc-bill', 'modal-doc-breaker', 'modal-doc-roof', 'modal-doc-title', 'modal-doc-clearance', 'modal-doc-id'];
modalFileInputs.forEach(inputId => {
  const input = document.getElementById(inputId);
  const badge = document.getElementById(`badge-${inputId}`);
  
  input.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const key = inputId.replace('modal-doc-', '');
      modalFormData.attachments[key] = {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        type: file.type || 'unknown'
      };
      badge.textContent = 'Uploaded';
      badge.style.display = 'inline-flex';
    } else {
      const key = inputId.replace('modal-doc-', '');
      delete modalFormData.attachments[key];
      badge.style.display = 'none';
    }
  });
});

// Navigation buttons
modalPrevBtn.addEventListener('click', () => {
  if (modalCurrentStep > 1) {
    goToModalStep(modalCurrentStep - 1);
  }
});

modalNextBtn.addEventListener('click', async () => {
  if (modalCurrentStep === 3) {
    const state = modalStateInput.value.trim();
    const city = modalCityInput.value.trim();
    const utility = modalUtilityInput.value.trim();
    const street = modalStreetInput.value.trim();
    if (!state || !city || !utility || !street) {
      alert('Please fill out all required location and utility fields.');
      return;
    }
  }
  
  if (modalCurrentStep < modalTotalSteps) {
    goToModalStep(modalCurrentStep + 1);
  } else {
    // Submit lead
    ingestForm.requestSubmit();
  }
});

function goToModalStep(step) {
  document.querySelectorAll('#lead-modal .form-step').forEach(stepDiv => {
    stepDiv.classList.remove('active');
  });
  document.getElementById(`modal-step-${step}`).classList.add('active');
  
  modalCurrentStep = step;
  modalProgressFill.style.width = `${(modalCurrentStep / modalTotalSteps) * 100}%`;
  
  modalLbls.forEach((lbl, idx) => {
    if (idx < modalCurrentStep) lbl.classList.add('active');
    else lbl.classList.remove('active');
  });
  
  switch(step) {
    case 1:
      modalStepDesc.textContent = 'Step 1: Property Qualification';
      modalPrevBtn.style.visibility = 'hidden';
      modalNextBtn.textContent = 'Next Step';
      break;
    case 2:
      modalStepDesc.textContent = 'Step 2: Consumption & Financials';
      modalPrevBtn.style.visibility = 'visible';
      modalNextBtn.textContent = 'Next Step';
      break;
    case 3:
      modalStepDesc.textContent = 'Step 3: Technical Roof Details';
      modalPrevBtn.style.visibility = 'visible';
      modalNextBtn.textContent = 'Next Step';
      break;
    case 4:
      modalStepDesc.textContent = 'Step 4: Contact & Consent';
      modalPrevBtn.style.visibility = 'visible';
      modalNextBtn.textContent = 'Save Lead';
      break;
  }
}

// Ingestion submit listener
ingestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const full_name = document.getElementById('full_name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim() || null;
  const lead_source = document.getElementById('lead_source').value.trim() || 'dashboard';
  const smsConsent = document.getElementById('modal-sms-consent').checked;
  
  if (!full_name || !phone) {
    alert('Full Name and Phone Number are required.');
    return;
  }
  
  if (!smsConsent) {
    alert('SMS Consent must be agreed to save.');
    return;
  }
  
  const payload = {
    full_name,
    phone,
    email,
    service_type: modalFormData.property_type === 'commercial' ? 'commercial_solar' : 'solar',
    monthly_bill: modalFormData.monthly_bill,
    metadata: {
      currency: modalFormData.currency,
      property_type: modalFormData.property_type,
      ownership_status: modalFormData.ownership_status,
      roof_type: modalFormData.roof_type,
      primary_goal: modalFormData.primary_goal,
      country: modalCountrySelect.value,
      state_region: modalStateInput.value.trim(),
      city_municipality: modalCityInput.value.trim(),
      utility_provider: modalUtilityInput.value.trim(),
      street_address: modalStreetInput.value.trim(),
      property_address: `${modalStreetInput.value.trim()}, ${modalCityInput.value.trim()}, ${modalStateInput.value.trim()}, ${modalCountrySelect.value}`,
      attachments: modalFormData.attachments,
      source: 'portal_manual_estimator',
      lead_source: lead_source,
      submitted_at: new Date().toISOString()
    }
  };

  try {
    const res = await fetch('/api/v1/leads/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      toggleModal(false);
      ingestForm.reset();
      await loadData();
    } else {
      alert(`Failed to save lead: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Ingestion HTTP error:', err);
    alert('Failed to connect to the server API.');
  }
});

// Init load
loadData();

// Core Loader Function
async function loadData() {
  try {
    // 1. Fetch leads & logs from database
    const res = await fetch('/api/v1/leads/leads');
    if (!res.ok) throw new Error('API server returned error status');
    const data = await res.json();
    
    // In-memory mode returns { leads, logs } directly
    // Let's fallback gracefully if mock endpoints aren't available
    leads = data.leads || [];
    logs = data.logs || [];
    
    // Reverse logs to show newest first
    logs.reverse();

    // Populate SMS reply dropdown simulator
    populateSmsReplyDropdown();

    // 2. Render components
    renderStats();
    renderKanban();
    renderLogs();
    renderContactsTable();
  } catch (err) {
    console.error('[App] Failed to load data:', err);
    // Display offline message in log feed
    logsListEl.innerHTML = `<div class="log-empty" style="color: var(--danger)">Connection to server offline. Check node backend status.</div>`;
  }
}

// 1. Calculate & Render Stats
function renderStats() {
  const total = leads.length;
  totalLeadsEl.textContent = total;

  if (total === 0) {
    contactedRateEl.textContent = '0%';
    contactedCountEl.textContent = '0 leads';
    closedWonEl.textContent = '0';
    closedWonPctEl.textContent = '0% conversion';
    pipelineValueEl.textContent = '$0.00';
    return;
  }

  // Contacted stats
  const contacted = leads.filter(l => l.pipeline_stage === 'contacted').length;
  const contactedRate = Math.round((contacted / total) * 100);
  contactedRateEl.textContent = `${contactedRate}%`;
  contactedCountEl.textContent = `${contacted} contacted`;

  // Closed Won stats
  const closedWon = leads.filter(l => l.pipeline_stage === 'closed_won').length;
  const closedWonPct = Math.round((closedWon / total) * 100);
  closedWonEl.textContent = closedWon;
  closedWonPctEl.textContent = `${closedWonPct}% conversion`;

  // Pipeline Value (grouped and summed by currency)
  const pipelineSums = {};
  leads.forEach(lead => {
    const currency = (lead.metadata && lead.metadata.currency) || 'USD';
    const bill = parseFloat(lead.monthly_bill) || 0;
    pipelineSums[currency] = (pipelineSums[currency] || 0) + bill;
  });

  const formattedSums = Object.keys(pipelineSums)
    .map(curr => formatCurrency(pipelineSums[curr], curr))
    .join(' | ');

  pipelineValueEl.textContent = formattedSums || '$0.00';
}

// 2. Render Kanban Columns & Cards
function renderKanban() {
  try {
    // Clear columns
    STAGES.forEach(stage => {
      if (COLUMNS[stage] && COLUMNS[stage].container) {
        COLUMNS[stage].container.innerHTML = '';
        COLUMNS[stage].count.textContent = '0';
      }
    });

    // Group leads by stage
    const groups = {};
    STAGES.forEach(stage => groups[stage] = []);

    const cCountry = filterCountry ? filterCountry.value : 'all';
    const cState = filterState ? filterState.value.toLowerCase().trim() : '';
    const cCity = filterCity ? filterCity.value.toLowerCase().trim() : '';

    leads.forEach(lead => {
      const meta = lead.metadata || {};
      const countryVal = meta.country || 'PH';
      const stateVal = String(meta.state_region || '').toLowerCase().trim();
      const cityVal = String(meta.city_municipality || '').toLowerCase().trim();

      const matchCountry = cCountry === 'all' || countryVal === cCountry || (cCountry === 'OTHER' && !['PH', 'US', 'GB', 'AU', 'CA', 'DE'].includes(countryVal));
      const matchState = !cState || stateVal.includes(cState);
      const matchCity = !cCity || cityVal.includes(cCity);

      if (matchCountry && matchState && matchCity) {
        if (groups[lead.pipeline_stage]) {
          groups[lead.pipeline_stage].push(lead);
        }
      }
    });

    // Render cards
    STAGES.forEach(stage => {
      const list = groups[stage];
      if (COLUMNS[stage] && COLUMNS[stage].count) {
        COLUMNS[stage].count.textContent = list.length;
      }
      
      if (list.length === 0) {
        return;
      }

      list.forEach(lead => {
        const card = createLeadCard(lead);
        if (COLUMNS[stage] && COLUMNS[stage].container) {
          COLUMNS[stage].container.appendChild(card);
        }
      });
    });

    setupDragAndDrop();
  } catch (err) {
    console.error('[Kanban] Render error:', err);
  }
}

// Create Lead DOM Element
function createLeadCard(lead) {
  const card = document.createElement('div');
  card.className = 'lead-card';
  card.setAttribute('draggable', 'true');
  card.setAttribute('data-id', lead.id);

  const meta = lead.metadata || {};
  const currency = meta.currency || 'USD';
  const formattedBill = lead.monthly_bill 
    ? formatCurrency(lead.monthly_bill, currency) 
    : 'Not provided';

  // Format service name for CSS
  const serviceClass = lead.service_type || 'other';
  const serviceLabel = (lead.service_type || 'Other').replace('_', ' ');

  // Location details
  const country = meta.country || 'PH';
  const city = meta.city_municipality || '';
  const flagMap = { PH: '🇵🇭', US: '🇺🇸', GB: '🇬🇧', AU: '🇦🇺', CA: '🇨🇦', DE: '🇩🇪' };
  const flag = flagMap[country] || '📍';
  
  let locationLabel = '';
  if (city) {
    locationLabel = `${city}, ${country} ${flag}`;
  } else if (meta.property_address) {
    locationLabel = meta.property_address;
  }

  card.innerHTML = `
    <div class="card-header-row">
      <h5 class="card-name">${lead.full_name}</h5>
      <span class="service-tag ${serviceClass}">${serviceLabel}</span>
    </div>
    <div class="card-body">
      <div class="card-detail-item">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        <span>${lead.phone}</span>
      </div>
      ${lead.email ? `
        <div class="card-detail-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
          <span>${lead.email}</span>
        </div>
      ` : ''}
      <div class="card-value">Bill: ${formattedBill}</div>
      ${locationLabel ? `
        <div class="card-detail-item" style="margin-top: 4px; font-size: 10px; color: var(--primary); font-weight: 500;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;" title="${locationLabel}">${locationLabel}</span>
        </div>
      ` : ''}
    </div>
    
    <!-- Quick navigation controls (fallback/accessibility) -->
    <div class="card-actions">
      ${STAGES.filter(s => s !== lead.pipeline_stage).map(s => `
        <button class="action-btn-sm" title="Move to ${s.replace('_', ' ')}" onclick="moveStageDirect('${lead.id}', '${s}')">
          ${getStageIconShort(s)}
        </button>
      `).join('')}
    </div>
  `;

  // Attach detail inspection modal trigger on card click (except when clicking direct move buttons)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-actions') || e.target.closest('.action-btn-sm')) {
      return;
    }
    openInspector(lead);
  });

  return card;
}

// Stage abbreviations for quick access buttons
function getStageIconShort(stage) {
  switch (stage) {
    case 'new': return '🆕';
    case 'contacted': return '📞';
    case 'estimate_scheduled': return '📅';
    case 'closed_won': return '✅';
    case 'closed_lost': return '❌';
    default: return '➡️';
  }
}

// 3. Render Audit Log Feed
function renderLogs() {
  logsListEl.innerHTML = '';

  if (logs.length === 0) {
    logsListEl.innerHTML = `<div class="log-empty">No events logged yet.</div>`;
    return;
  }

  logs.forEach(log => {
    const logItem = document.createElement('div');
    logItem.className = `log-item ${log.event_type}`;
    
    const formattedDate = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let description = '';
    if (log.event_type === 'lead_created') {
      description = `New lead created: ${log.payload.lead?.full_name || 'Unknown'}`;
    } else if (log.event_type === 'stage_updated') {
      const fromStage = log.payload.from.replace('_', ' ');
      const toStage = log.payload.to.replace('_', ' ');
      description = `Moved stage: ${fromStage} ➔ ${toStage}`;
    } else {
      description = JSON.stringify(log.payload);
    }

    logItem.innerHTML = `
      <div class="log-meta">
        <strong>${log.event_type.replace('_', ' ').toUpperCase()}</strong>
        <span>${formattedDate}</span>
      </div>
      <div class="log-desc">${description}</div>
    `;

    logsListEl.appendChild(logItem);
  });
}

// Helper to update a lead's stage via API
async function updateLeadStage(leadId, newStage) {
  try {
    const res = await fetch(`/api/v1/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_stage: newStage })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      await loadData();
    } else {
      alert(`Failed to update stage: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Failed to update stage:', err);
    alert('HTTP error updating stage.');
  }
}

// Direct button move handler (attached to window scope to allow dynamic inline click events)
window.moveStageDirect = function(leadId, newStage) {
  updateLeadStage(leadId, newStage);
};

// Drag & Drop Setup
function setupDragAndDrop() {
  const cards = document.querySelectorAll('.lead-card');
  const columns = document.querySelectorAll('.kanban-column');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });

  columns.forEach(column => {
    const stage = column.getAttribute('data-stage');

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
    });

    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('text/plain');
      if (leadId) {
        // Find if lead is already in this stage
        const leadObj = leads.find(l => l.id === leadId);
        if (leadObj && leadObj.pipeline_stage !== stage) {
          updateLeadStage(leadId, stage);
        }
      }
    });
  });
}

// Modal Toggle Helper
function toggleModal(open) {
  if (open) {
    leadModal.classList.add('open');
  } else {
    leadModal.classList.remove('open');
  }
}

// SMS Outbox Simulator Logic
let lastSmsPollTime = Date.now() - 5000;
const smsPanel = document.getElementById('sms-panel');
const smsMessagesContainer = document.getElementById('sms-messages-container');
const smsToggleBtn = document.getElementById('sms-toggle-btn');

smsToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  smsPanel.classList.toggle('minimized');
  if (smsPanel.classList.contains('minimized')) {
    smsToggleBtn.textContent = 'Expand';
  } else {
    smsToggleBtn.textContent = 'Minimize';
  }
});

async function pollSimulatedSms() {
  try {
    const res = await fetch(`/api/v1/leads/simulated-sms?since=${lastSmsPollTime}`);
    if (!res.ok) return;
    const data = await res.json();

    const newMessages = data.sms || [];
    if (newMessages.length > 0) {
      const placeholder = smsMessagesContainer.querySelector('.sms-placeholder');
      if (placeholder) {
        smsMessagesContainer.innerHTML = '';
      }

      newMessages.forEach(msg => {
        const msgTime = new Date(msg.created_at).getTime();
        if (msgTime > lastSmsPollTime) {
          lastSmsPollTime = msgTime;
        }
        renderSmsBubble(msg);
      });

      playSmsChime();

      if (smsPanel.classList.contains('minimized')) {
        smsPanel.classList.remove('minimized');
        smsToggleBtn.textContent = 'Minimize';
      }
    }
  } catch (err) {
    console.warn('Failed to poll simulated SMS:', err);
  }
}

function renderSmsBubble(msg) {
  const bubble = document.createElement('div');
  bubble.className = `sms-bubble ${msg.type}`;
  const formattedTime = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let metaHTML = '';
  if (msg.type === 'customer_autoresponder') {
    metaHTML = `<div class="sms-bubble-meta cust"><span>Customer SMS Sent (Auto-Reply)</span><span>${msg.to}</span></div>`;
  } else if (msg.type === 'stage_automation') {
    metaHTML = `<div class="sms-bubble-meta cust"><span>Customer SMS Sent (Stage Update)</span><span>${msg.to}</span></div>`;
  } else {
    metaHTML = `<div class="sms-bubble-meta intl"><span>Staff SMS Sent</span><span>${msg.to}</span></div>`;
  }

  bubble.innerHTML = `
    ${metaHTML}
    <div>${msg.message}</div>
    <div class="sms-bubble-time">${formattedTime}</div>
  `;

  smsMessagesContainer.appendChild(bubble);
  smsMessagesContainer.scrollTop = smsMessagesContainer.scrollHeight;
}

function playSmsChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gainNode.gain.setValueAtTime(0.04, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = audioCtx.currentTime;
    playTone(587.33, now, 0.12); // D5
    playTone(880.00, now + 0.08, 0.2); // A5
  } catch (e) {
    console.log('Audio chime blocked by autoplay security policy.');
  }
}

// Start polling loop every 2 seconds
setInterval(pollSimulatedSms, 2000);

// Helper for formatting currencies
function formatCurrency(amount, currencyCode) {
  const code = (currencyCode || 'USD').toUpperCase();
  let locale = 'en-US';
  if (code === 'PHP') locale = 'en-PH';
  else if (code === 'EUR') locale = 'de-DE';
  else if (code === 'GBP') locale = 'en-GB';
  
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount);
  } catch (e) {
    const symbols = { PHP: '₱', USD: '$', EUR: '€', GBP: '£', AUD: '$', CAD: '$' };
    const sym = symbols[code] || '$';
    return `${sym}${Number(amount).toFixed(2)}`;
  }
}

// Lead Inspector DOM Elements
let activeInspectorLeadId = null;
const inspectorModal = document.getElementById('inspector-modal');
const closeInspectorBtn = document.getElementById('close-inspector-btn');
const closeInspectorActionBtn = document.getElementById('close-inspector-action-btn');
const deleteInspectorActionBtn = document.getElementById('delete-inspector-action-btn');

const inspectLeadName = document.getElementById('inspect-lead-name');
const inspectLeadStage = document.getElementById('inspect-lead-stage');
const inspectPhone = document.getElementById('inspect-phone');
const inspectEmail = document.getElementById('inspect-email');
const inspectService = document.getElementById('inspect-service');
const inspectCreated = document.getElementById('inspect-created');

const inspectTechnicalSec = document.getElementById('inspect-technical-sec');
const inspectPropType = document.getElementById('inspect-prop-type');
const inspectOwnership = document.getElementById('inspect-ownership');
const inspectMonthlyBill = document.getElementById('inspect-monthly-bill');
const inspectRoofType = document.getElementById('inspect-roof-type');
const inspectCountry = document.getElementById('inspect-country');
const inspectState = document.getElementById('inspect-state');
const inspectCity = document.getElementById('inspect-city');
const inspectUtility = document.getElementById('inspect-utility');
const inspectStreet = document.getElementById('inspect-street');
const inspectGoal = document.getElementById('inspect-goal');

const inspectAttachmentsSec = document.getElementById('inspect-attachments-sec');
const inspectAttachmentsList = document.getElementById('inspect-attachments-list');
const inspectInventorySec = document.getElementById('inspect-inventory-sec');
const inspectInventoryMatching = document.getElementById('inspect-inventory-matching');
const inspectLogsSec = document.getElementById('inspect-logs-sec');
const inspectLogsList = document.getElementById('inspect-logs-list');

// New selectors for ROI forecaster and Proposal Generator
const inspectRoiSec = document.getElementById('inspect-roi-sec');
const roiPaybackVal = document.getElementById('roi-payback-val');
const roiSavingsVal = document.getElementById('roi-savings-val');
const roiTreesVal = document.getElementById('roi-trees-val');
const roiCo2Val = document.getElementById('roi-co2-val');
const roiChartWrapper = document.getElementById('roi-chart-wrapper');

const proposalModal = document.getElementById('proposal-modal');
const closeProposalModalBtn = document.getElementById('close-proposal-modal-btn');
const inspectGenerateProposalBtn = document.getElementById('inspect-generate-proposal-btn');
const proposalDate = document.getElementById('proposal-date');
const proposalQuoteId = document.getElementById('proposal-quote-id');
const proposalClientName = document.getElementById('proposal-client-name');
const proposalClientPhone = document.getElementById('proposal-client-phone');
const proposalClientEmail = document.getElementById('proposal-client-email');
const proposalClientAddress = document.getElementById('proposal-client-address');
const proposalClientUtility = document.getElementById('proposal-client-utility');
const proposalHardwareTbody = document.getElementById('proposal-hardware-tbody');
const proposalRoiPayback = document.getElementById('proposal-roi-payback');
const proposalRoiYearly = document.getElementById('proposal-roi-yearly');
const proposalRoiCumulative = document.getElementById('proposal-roi-cumulative');
const proposalEcoTrees = document.getElementById('proposal-eco-trees');
const proposalEcoCo2 = document.getElementById('proposal-eco-co2');
const proposalEcoCoal = document.getElementById('proposal-eco-coal');

const proposalSigCanvas = document.getElementById('proposal-sig-canvas');
const clearSigBtn = document.getElementById('clear-sig-btn');
const printProposalBtn = document.getElementById('print-proposal-btn');
const saveProposalBtn = document.getElementById('save-proposal-btn');

const fulfillmentShipmentsContainer = document.getElementById('fulfillment-shipments-container');
const partnerOrdersContainer = document.getElementById('partner-orders-container');

const smsReplyLeadSelect = document.getElementById('sms-reply-lead-select');
const smsReplyText = document.getElementById('sms-reply-text');
const smsReplySendBtn = document.getElementById('sms-reply-send-btn');

// Contacts Tab Add button
const contactAddBtn = document.getElementById('contact-add-btn');
if (contactAddBtn) {
  contactAddBtn.addEventListener('click', () => {
    toggleModal(true);
  });
}

// Close handlers
if (closeInspectorBtn) closeInspectorBtn.addEventListener('click', () => {
  inspectorModal.style.display = 'none';
  activeInspectorLeadId = null;
});
if (closeInspectorActionBtn) closeInspectorActionBtn.addEventListener('click', () => {
  inspectorModal.style.display = 'none';
  activeInspectorLeadId = null;
});
window.addEventListener('click', (e) => {
  if (e.target === inspectorModal) {
    inspectorModal.style.display = 'none';
    activeInspectorLeadId = null;
  }
});

// Delete lead from Inspector
if (deleteInspectorActionBtn) {
  deleteInspectorActionBtn.addEventListener('click', async () => {
    if (!activeInspectorLeadId) return;
    if (!confirm('Are you sure you want to permanently delete this lead record and all of its associated logs?')) return;
    
    try {
      const response = await fetch(`/api/v1/leads/${activeInspectorLeadId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        inspectorModal.style.display = 'none';
        activeInspectorLeadId = null;
        await loadData();
      } else {
        const result = await response.json();
        alert(`Failed to delete lead: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[Inspector] Deletion failed:', err);
      alert('Failed to connect to server.');
    }
  });
}

function getDocIcon(key) {
  switch (key) {
    case 'bill': return '🧾';
    case 'breaker': return '⚡';
    case 'roof': return '📸';
    case 'title': return '📜';
    case 'clearance': return '🏢';
    case 'id': return '🪪';
    default: return '📄';
  }
}

function openInspector(lead) {
  activeInspectorLeadId = lead.id;
  const meta = lead.metadata || {};
  const currency = meta.currency || 'USD';
  
  inspectLeadName.textContent = lead.full_name;
  inspectLeadStage.textContent = lead.pipeline_stage.replace('_', ' ');
  inspectLeadStage.className = `badge stage-${lead.pipeline_stage}`;
  inspectPhone.textContent = lead.phone;
  inspectEmail.textContent = lead.email || 'Not provided';
  inspectService.textContent = (lead.service_type || 'other').replace('_', ' ');
  inspectCreated.textContent = new Date(lead.created_at).toLocaleString();
  
  // Solar Estimator details
  if (meta.source === 'solar_estimator_wizard' || meta.source === 'landing_page_estimator' || meta.property_type || meta.roof_type) {
    inspectTechnicalSec.style.display = 'block';
    inspectPropType.textContent = meta.property_type || 'Residential';
    inspectOwnership.textContent = meta.ownership_status || 'Own';
    inspectMonthlyBill.textContent = formatCurrency(lead.monthly_bill, currency);
    inspectRoofType.textContent = meta.roof_type || 'Metal';
    inspectCountry.textContent = meta.country || 'PH';
    inspectState.textContent = meta.state_region || '—';
    inspectCity.textContent = meta.city_municipality || '—';
    inspectUtility.textContent = meta.utility_provider || '—';
    inspectStreet.textContent = meta.street_address || meta.property_address || 'Not provided';
    
    let goalText = 'Lower electric bills';
    if (meta.primary_goal === 'backup_typhoons') goalText = 'Backup power for typhoons & brownouts';
    else if (meta.primary_goal === 'both') goalText = 'Lower bills & Typhoon backup power';
    inspectGoal.textContent = goalText;
  } else {
    inspectTechnicalSec.style.display = 'none';
  }
  
  // Document Attachments lists
  if (meta.attachments && Object.keys(meta.attachments).length > 0) {
    inspectAttachmentsSec.style.display = 'block';
    inspectAttachmentsList.innerHTML = '';
    
    Object.entries(meta.attachments).forEach(([key, info]) => {
      const docLabel = key.replace(/_/g, ' ');
      const item = document.createElement('div');
      item.className = 'attachment-item';
      item.innerHTML = `
        <div class="attachment-info">
          <span class="attachment-icon">${getDocIcon(key)}</span>
          <div>
            <div class="attachment-name" style="text-transform: capitalize;">${docLabel}</div>
            <div class="attachment-size">${info.size || 'Unknown size'} • ${info.name}</div>
          </div>
        </div>
        <a href="#" class="attachment-link" onclick="alert('Demo Mode: In a production Supabase instance, this link downloads the direct signed Storage bucket asset: ${info.name}'); return false;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Download
        </a>
      `;
      inspectAttachmentsList.appendChild(item);
    });
  } else {
    inspectAttachmentsSec.style.display = 'none';
  }

  // Inventory Allocation & Fulfillment Logic
  if (meta.source === 'solar_estimator_wizard' || meta.source === 'landing_page_estimator' || meta.property_type || meta.roof_type) {
    inspectInventorySec.style.display = 'block';
    inspectInventoryMatching.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">Loading live warehouse inventory...</div>';
    
    // Fetch fresh stock details
    fetch('/api/v1/inventory')
      .then(res => res.json())
      .then(data => {
        const inv = data.inventory || [];
        const leadCountry = meta.country || 'PH';
        const isCommercial = meta.property_type === 'commercial';
        
        // Define required products based on estimator scale
        const requirements = isCommercial ? [
          { sku: 'APX-PAN-550M', name: 'Apex Mono 550W Solar Panel', qty: 40 },
          { sku: 'APX-INV-10HY', name: 'Apex Hybrid Inverter 10kW', qty: 2 },
          { sku: 'APX-BAT-LFP10', name: 'Apex LFP Battery Unit 10.24kWh', qty: 2 }
        ] : [
          { sku: 'APX-PAN-400M', name: 'Apex Compact 400W Panel', qty: 10 },
          { sku: 'APX-INV-05HY', name: 'Apex Hybrid Inverter 5kW', qty: 1 },
          { sku: 'APX-BAT-LFP10', name: 'Apex LFP Battery Unit 10.24kWh', qty: 1 }
        ];

        inspectInventoryMatching.innerHTML = '';
        
        requirements.forEach(req => {
          const localItem = inv.find(item => item.sku === req.sku && item.warehouse_country === leadCountry);
          const localQty = localItem ? localItem.quantity : 0;
          
          if (localQty >= req.qty) {
            // Local warehouse has enough units
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(16,185,129,0.05); border-radius: 6px; border: 1px solid rgba(16,185,129,0.15);';
            div.innerHTML = `
              <div>
                <strong>${req.name}</strong><br>
                <span style="color: var(--success); font-size: 10px;">✅ Sufficient Local Stock (Warehouse: ${leadCountry} 🏡)</span>
              </div>
              <div style="font-weight: 700; color: var(--success); font-size: 13px;">${localQty} / ${req.qty}</div>
            `;
            inspectInventoryMatching.appendChild(div);
          } else {
            // Local warehouse is lacking stock, check global partner warehouse
            const partnerItem = inv.find(item => item.sku === req.sku + '-CN' || (item.sku === req.sku && item.warehouse_country === 'CN'));
            const partnerQty = partnerItem ? partnerItem.quantity : 0;
            
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 12px; background: rgba(245,158,11,0.05); border-radius: 6px; border: 1px solid rgba(245,158,11,0.15);';
            
            let partnerActionHTML = '';
            if (partnerQty > 0) {
              partnerActionHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; margin-top: 4px;">
                  <span style="font-size: 10px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px;">
                    🌐 Partner Warehouse: <strong>${partnerQty} units</strong>
                  </span>
                  <button class="btn btn-primary" style="padding: 4px 10px; font-weight: 600; font-size: 10px; border-radius: 4px; box-shadow: 0 4px 12px var(--shadow-color);" onclick="requestSupplyOrder('${lead.id}', '${partnerItem.sku}', 'CN', '1', '${req.name}')">
                    Request Partner Shipping ✈️
                  </button>
                </div>
              `;
            } else {
              partnerActionHTML = `
                <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; margin-top: 4px; font-size: 10px; color: var(--danger);">
                  ❌ Out of stock globally (including partner warehouses).
                </div>
              `;
            }

            div.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong>${req.name}</strong><br>
                  <span style="color: var(--warning); font-size: 10px;">⚠️ Lacking Local Stock in ${leadCountry} (${localQty} available)</span>
                </div>
                <div style="font-weight: 700; color: var(--warning); font-size: 13px;">${localQty} / ${req.qty}</div>
              </div>
              ${partnerActionHTML}
            `;
            inspectInventoryMatching.appendChild(div);
          }
        });
      })
      .catch(err => {
        console.error('[Inspector] Live matching error:', err);
        inspectInventoryMatching.innerHTML = '<div style="color: var(--danger);">Failed to reconcile live stock balances.</div>';
      });
  } else {
    inspectInventorySec.style.display = 'none';
  }

  // ROI & Carbon Offset dynamic calculator
  if (meta.source === 'solar_estimator_wizard' || meta.source === 'landing_page_estimator' || meta.property_type || meta.roof_type) {
    inspectRoiSec.style.display = 'block';
    
    const monthlyBill = parseFloat(lead.monthly_bill) || 0;
    const isCommercial = meta.property_type === 'commercial';
    const currency = meta.currency || 'PHP';

    // Pricing Model: Residential PHP 180k, Commercial PHP 720k. Group exchange rates: PHP to USD 56, PHP to EUR 60
    let sysCost = isCommercial ? 720000 : 180000;
    let exchangeRate = 1.0;
    if (currency === 'USD') exchangeRate = 56.0;
    else if (currency === 'EUR') exchangeRate = 60.0;
    else if (currency === 'GBP') exchangeRate = 70.0;
    
    // Scale system cost to match selected currency
    const systemCostInLocal = sysCost / exchangeRate;
    const yearlySavings = monthlyBill * 12 * 0.85; // 85% offset
    const paybackPeriod = yearlySavings > 0 ? (systemCostInLocal / yearlySavings) : 0;

    roiPaybackVal.textContent = paybackPeriod > 0 ? `${paybackPeriod.toFixed(1)} Years` : '—';
    
    // 25-Year Cumulative Net Savings (taking 4.5% rate inflation into account)
    let totalSavings = 0;
    let currentAnnualSavings = yearlySavings;
    for (let yr = 1; yr <= 25; yr++) {
      totalSavings += currentAnnualSavings;
      currentAnnualSavings *= 1.045; // rate increases
    }
    const cumulativeSavings = totalSavings - systemCostInLocal;
    roiSavingsVal.textContent = formatCurrency(cumulativeSavings, currency);

    // Carbon offset parameters
    const monthlyKWh = monthlyBill * (currency === 'PHP' ? 0.1 : 6.0); // Simple scaling factor for non-PHP currencies
    const annualKWhOffset = monthlyKWh * 12 * 0.85;
    const co2SavedTons = (annualKWhOffset * 0.5) / 1000.0;
    const treesEquivalent = Math.round(co2SavedTons * 45); // 1 ton of CO2 is offset by approx. 45 trees per year

    roiTreesVal.textContent = treesEquivalent.toLocaleString();
    roiCo2Val.textContent = co2SavedTons.toFixed(1);

    // SVG Area Chart drawing (10 Year savings timeline vs payback line)
    const years = Array.from({ length: 10 }, (_, i) => i + 1);
    let chartSavings = [];
    let runningSavings = -systemCostInLocal;
    let stepAnnual = yearlySavings;
    
    for (let yr = 1; yr <= 10; yr++) {
      runningSavings += stepAnnual;
      chartSavings.push(runningSavings);
      stepAnnual *= 1.045;
    }

    // Map savings to SVG coordinates
    const minVal = -systemCostInLocal;
    const maxVal = chartSavings[9] * 1.1;
    const valRange = maxVal - minVal;

    const svgWidth = 260;
    const svgHeight = 110;
    
    const points = chartSavings.map((val, idx) => {
      const x = (idx / 9) * (svgWidth - 20) + 10;
      const y = svgHeight - 15 - ((val - minVal) / valRange) * (svgHeight - 25);
      return { x, y, val };
    });

    const pathData = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    const areaPathData = `${pathData} L ${points[9].x} ${svgHeight - 15} L ${points[0].x} ${svgHeight - 15} Z`;
    
    // Break-even Y coordinate
    const breakEvenY = svgHeight - 15 - ((0 - minVal) / valRange) * (svgHeight - 25);

    roiChartWrapper.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none" style="display: block;">
        <defs>
          <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#818cf8" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#818cf8" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <!-- Horizontal Grid Line (Break-Even / Payback Point) -->
        <line x1="10" y1="${breakEvenY}" x2="${svgWidth - 10}" y2="${breakEvenY}" stroke="rgba(245,158,11,0.4)" stroke-width="1.5" stroke-dasharray="3,3"/>
        <text x="12" y="${breakEvenY - 4}" fill="rgba(245,158,11,0.8)" font-size="8px" font-weight="700">BREAK EVEN (PAYBACK)</text>
        
        <!-- Shaded Area -->
        <path d="${areaPathData}" fill="url(#chart-grad)" />
        
        <!-- Trend Line -->
        <path d="${pathData}" fill="none" stroke="#818cf8" stroke-width="2" />
        
        <!-- Points & Tooltips -->
        ${points.map((p, i) => `
          <circle cx="${p.x}" cy="${p.y}" r="3" fill="#818cf8" stroke="rgba(17,20,34,0.8)" stroke-width="1"/>
          ${i === 0 || i === 4 || i === 9 ? `
            <text x="${p.x}" y="${p.y - 6}" fill="#fff" font-size="8px" text-anchor="middle" font-weight="600">
              Yr ${i + 1}
            </text>
          ` : ''}
        `).join('')}
      </svg>
    `;
  } else {
    inspectRoiSec.style.display = 'none';
  }

  // Communications & Activity Log render
  const leadLogs = logs.filter(log => log.lead_id === lead.id);
  if (leadLogs.length > 0) {
    inspectLogsSec.style.display = 'block';
    inspectLogsList.innerHTML = '';
    
    leadLogs.slice().reverse().forEach(log => {
      const logDiv = document.createElement('div');
      logDiv.style.cssText = 'border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 6px; margin-bottom: 4px;';
      
      const timeStr = new Date(log.created_at).toLocaleString();
      let icon = '✉️';
      if (log.payload && log.payload.type === 'supply_chain_request') icon = '📦';
      else if (log.payload && log.payload.message && log.payload.message.includes('Welcome')) icon = '⚡';
      
      logDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 2px;">
          <span>${icon} ${log.event_type.replace('_', ' ').toUpperCase()}</span>
          <span>${timeStr}</span>
        </div>
        <div style="color: #eee; line-height: 1.4;">${log.payload ? log.payload.message : 'Event occurred'}</div>
      `;
      inspectLogsList.appendChild(logDiv);
    });
  } else {
    inspectLogsSec.style.display = 'none';
  }

  inspectorModal.style.display = 'flex';
}

// Tab switching
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const targetTab = btn.getAttribute('data-tab');
    tabPanels.forEach(panel => {
      if (panel.id === targetTab) {
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });

    if (targetTab === 'contacts-view') {
      renderContactsTable();
    } else if (targetTab === 'inventory-view') {
      loadInventory();
      loadFulfillment();
    } else if (targetTab === 'map-view') {
      initMap();
    }
  });
});

let fulfillmentOrders = [];

async function loadFulfillment() {
  try {
    const res = await fetch('/api/v1/leads/fulfillment/list');
    if (!res.ok) throw new Error('API returned error');
    const data = await res.json();
    fulfillmentOrders = data.orders || [];
    renderFulfillment();
  } catch (err) {
    console.error('[Fulfillment] Load error:', err);
    fulfillmentShipmentsContainer.innerHTML = '<div style="color: var(--danger); padding: 15px;">Failed to load shipments.</div>';
  }
}

function renderFulfillment() {
  if (!fulfillmentShipmentsContainer || !partnerOrdersContainer) return;
  
  fulfillmentShipmentsContainer.innerHTML = '';
  partnerOrdersContainer.innerHTML = '';
  
  if (fulfillmentOrders.length === 0) {
    fulfillmentShipmentsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 25px; text-align: center;">No active cross-border shipments found. Open a lead details inspector to order components.</div>';
    partnerOrdersContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 25px; text-align: center;">No partner requests pending.</div>';
    return;
  }

  const statusStepLabels = {
    pending_dispatch: 'Pending Partner Dispatch 🇨🇳',
    in_transit: 'In Transit via Air Cargo ✈️',
    arrived: 'Arrived at Local Depot 🏡',
    installed: 'Installed & Commissioned ✅'
  };

  const statusStepWidths = {
    pending_dispatch: '25%',
    in_transit: '50%',
    arrived: '75%',
    installed: '100%'
  };

  fulfillmentOrders.forEach(order => {
    // 1. Render shipment tracking item
    const shipDiv = document.createElement('div');
    shipDiv.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 6px; padding: 15px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;';
    
    let trackingInfoHTML = '';
    if (order.carrier || order.tracking_number) {
      trackingInfoHTML = `
        <div style="font-size: 10px; color: var(--text-muted); background: rgba(0, 0, 0, 0.15); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 3px; margin-top: 4px;">
          <div>✈️ Carrier: <strong style="color: #fff;">${order.carrier || 'N/A'}</strong></div>
          <div>🪪 Airway Bill (AWB): <code style="color: var(--primary); font-family: monospace;">${order.tracking_number || 'N/A'}</code></div>
          <div>📅 Est. Delivery: <strong style="color: var(--success);">${order.estimated_delivery || 'N/A'}</strong></div>
        </div>
      `;
    }

    shipDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div>
          <span style="font-family: monospace; font-size: 10px; color: var(--primary); font-weight: 700;">ORDER ID: ${order.id.slice(0, 8).toUpperCase()}</span>
          <h4 style="margin: 2px 0 0 0; color: #fff; font-size: 13px;">${order.item_name} (x${order.quantity})</h4>
          <p style="font-size: 11px; color: var(--text-muted); margin: 2px 0 0 0;">Destination Customer: <strong>${order.lead_name}</strong> (Philippines)</p>
        </div>
        <span class="badge stage-${order.status}" style="font-size: 9px; padding: 4px 8px; text-transform: uppercase;">${order.status.replace('_', ' ')}</span>
      </div>
      
      ${trackingInfoHTML}
      
      <!-- Visual progress bar -->
      <div style="margin-top: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 4px;">
          <span>Partner Depot</span>
          <span>In Transit</span>
          <span>Local Depot</span>
          <span>Installed</span>
        </div>
        <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; position: relative; overflow: hidden;">
          <div style="height: 100%; width: ${statusStepWidths[order.status]}; background: var(--primary); transition: width 0.4s ease;"></div>
        </div>
      </div>
    `;
    fulfillmentShipmentsContainer.appendChild(shipDiv);

    // 2. Render partner dispatch console controls
    const partnerDiv = document.createElement('div');
    partnerDiv.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 11px; margin-bottom: 8px;';
    
    let actionBtnHTML = '';
    if (order.status === 'pending_dispatch') {
      actionBtnHTML = `
        <button class="btn btn-primary" id="dispatch-btn-${order.id}" style="padding: 6px 10px; font-size: 10px; font-weight: 600; width: 100%; border-radius: 4px;" onclick="showDispatchForm('${order.id}')">
          Ship Component (Mark In Transit ✈️)
        </button>
        <div id="dispatch-form-container-${order.id}" style="display: none; flex-direction: column; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04);">
          <input type="text" id="input-carrier-${order.id}" placeholder="Carrier (e.g. DHL, FedEx)" style="width: 100%; padding: 6px; font-size: 10px; border-radius: 4px; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); color: #fff;">
          <input type="text" id="input-tracking-${order.id}" placeholder="Airway Bill (AWB) Code" style="width: 100%; padding: 6px; font-size: 10px; border-radius: 4px; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); color: #fff;">
          <input type="text" id="input-eta-${order.id}" placeholder="ETA timeframe (e.g. 5-7 days)" style="width: 100%; padding: 6px; font-size: 10px; border-radius: 4px; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); color: #fff;">
          <div style="display: flex; gap: 6px; margin-top: 4px;">
            <button class="btn btn-primary" style="padding: 4px 8px; font-size: 9px; flex: 1; font-weight: 600; background: #16a34a; border-color: #16a34a;" onclick="submitShipmentDispatch('${order.id}')">Confirm Ship</button>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 9px; flex: 1; font-weight: 600;" onclick="hideDispatchForm('${order.id}')">Cancel</button>
          </div>
        </div>
      `;
    } else if (order.status === 'in_transit') {
      actionBtnHTML = `
        <button class="btn btn-primary" style="padding: 6px 10px; font-size: 10px; font-weight: 600; width: 100%; border-radius: 4px; background: #ea580c; border-color: #ea580c;" onclick="updateFulfillmentStatus('${order.id}', 'arrived')">
          Confirm Depot Arrival (Mark Arrived 🏡)
        </button>
      `;
    } else if (order.status === 'arrived') {
      actionBtnHTML = `
        <button class="btn btn-primary" style="padding: 6px 10px; font-size: 10px; font-weight: 600; width: 100%; border-radius: 4px; background: #16a34a; border-color: #16a34a;" onclick="updateFulfillmentStatus('${order.id}', 'installed')">
          Mark Installed & Commissioned ✅
        </button>
      `;
    } else {
      actionBtnHTML = `
        <div style="color: var(--success); font-weight: 600; text-align: center; padding: 4px;">
          ✅ System Active & Handed Over
        </div>
      `;
    }

    partnerDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between;">
        <strong>${order.item_name}</strong>
        <span style="color: var(--text-muted); font-size: 9px;">For ${order.lead_name}</span>
      </div>
      <div style="font-size: 10px; color: var(--text-muted);">
        Current State: <strong style="color: #fff;">${statusStepLabels[order.status]}</strong>
      </div>
      <div style="margin-top: 4px;">
        ${actionBtnHTML}
      </div>
    `;
    partnerOrdersContainer.appendChild(partnerDiv);
  });
}

window.updateFulfillmentStatus = async (orderId, nextStatus) => {
  try {
    const res = await fetch(`/api/v1/leads/fulfillment/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });
    
    if (res.ok) {
      await loadFulfillment();
      await loadData(); // Reload communications outbox log
    } else {
      alert('Failed to update shipment status.');
    }
  } catch (err) {
    console.error('[Fulfillment] Update error:', err);
    alert('Connection error.');
  }
};

// Render Contacts Directory table
function renderContactsTable() {
  try {
    if (!contactsTbody) return;
    const query = contactSearchInput.value.toLowerCase().trim();
    const filterStage = contactFilterStage.value;
    
    contactsTbody.innerHTML = '';
    
    const cCountry = filterCountry ? filterCountry.value : 'all';
    const cState = filterState ? filterState.value.toLowerCase().trim() : '';
    const cCity = filterCity ? filterCity.value.toLowerCase().trim() : '';

    const filteredLeads = leads.filter(lead => {
      const nameMatch = lead.full_name.toLowerCase().includes(query);
      const phoneMatch = lead.phone.includes(query);
      const emailMatch = (lead.email || '').toLowerCase().includes(query);
      const meta = lead.metadata || {};
      const addressMatch = String(meta.property_address || '').toLowerCase().includes(query);
      
      const countryVal = meta.country || 'PH';
      const stateVal = String(meta.state_region || '').toLowerCase().trim();
      const cityVal = String(meta.city_municipality || '').toLowerCase().trim();

      const matchesSearch = nameMatch || phoneMatch || emailMatch || addressMatch;
      const matchesStage = filterStage === 'all' || lead.pipeline_stage === filterStage;
      
      const matchesCountry = cCountry === 'all' || countryVal === cCountry || (cCountry === 'OTHER' && !['PH', 'US', 'GB', 'AU', 'CA', 'DE'].includes(countryVal));
      const matchesState = !cState || stateVal.includes(cState);
      const matchesCity = !cCity || cityVal.includes(cCity);
      
      return matchesSearch && matchesStage && matchesCountry && matchesState && matchesCity;
    });
    
    if (filteredLeads.length === 0) {
      contactsTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No contact records found matching criteria.
          </td>
        </tr>
      `;
      return;
    }
    
    filteredLeads.forEach(lead => {
      const tr = document.createElement('tr');
      const meta = lead.metadata || {};
      const address = meta.property_address || 'Not provided';
      const propType = meta.property_type || 'residential';
      const currency = meta.currency || 'PHP';
      
      tr.innerHTML = `
        <td style="font-weight: 600; color: #fff;">${lead.full_name}</td>
        <td>${lead.phone}</td>
        <td>${lead.email || '<span style="opacity: 0.4;">—</span>'}</td>
        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${address}">${address}</td>
        <td style="text-transform: capitalize;">${propType}</td>
        <td>${formatCurrency(lead.monthly_bill, currency)}</td>
        <td><span class="badge stage-${lead.pipeline_stage}" style="font-size: 10px;">${lead.pipeline_stage.replace('_', ' ')}</span></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" id="inspect-btn-${lead.id}">
              Inspect
            </button>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" id="edit-btn-${lead.id}">
              Edit
            </button>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--danger); border-color: rgba(239, 68, 68, 0.2);" id="delete-btn-${lead.id}">
              Delete
            </button>
          </div>
        </td>
      `;
      
      contactsTbody.appendChild(tr);
      
      // Bind inspector click
      document.getElementById(`inspect-btn-${lead.id}`).addEventListener('click', () => {
        openInspector(lead);
      });
      
      // Bind edit click
      document.getElementById(`edit-btn-${lead.id}`).addEventListener('click', () => {
        openEditLeadModal(lead);
      });
      
      // Bind delete click
      document.getElementById(`delete-btn-${lead.id}`).addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to permanently delete lead record: ${lead.full_name}?`)) return;
        try {
          const response = await fetch(`/api/v1/leads/${lead.id}`, {
            method: 'DELETE'
          });
          if (response.ok) {
            await loadData();
          } else {
            const result = await response.json();
            alert(`Failed to delete lead: ${result.error || 'Unknown error'}`);
          }
        } catch (err) {
          console.error('[Contacts] Deletion failed:', err);
          alert('Failed to connect to server.');
        }
      });
    });
  } catch (err) {
    console.error('[Contacts] Render table error:', err);
  }
}

// Contacts Search / Filters listeners
if (contactSearchInput) contactSearchInput.addEventListener('keyup', renderContactsTable);
if (contactFilterStage) contactFilterStage.addEventListener('change', renderContactsTable);

// Edit Lead Modal Management
const editLeadModal = document.getElementById('edit-lead-modal');
const editLeadForm = document.getElementById('edit-lead-form');
const closeEditLeadBtn = document.getElementById('close-edit-lead-btn');
const cancelEditLeadBtn = document.getElementById('cancel-edit-lead-btn');

window.openEditLeadModal = (lead) => {
  editLeadId = lead.id;
  
  const meta = lead.metadata || {};
  
  document.getElementById('edit-lead-name').value = lead.full_name || '';
  document.getElementById('edit-lead-phone').value = lead.phone || '';
  document.getElementById('edit-lead-email').value = lead.email || '';
  document.getElementById('edit-lead-bill').value = lead.monthly_bill || '';
  document.getElementById('edit-lead-currency').value = meta.currency || 'PHP';
  document.getElementById('edit-lead-country').value = meta.country || 'PH';
  document.getElementById('edit-lead-state').value = meta.state_region || '';
  document.getElementById('edit-lead-city').value = meta.city_municipality || '';
  document.getElementById('edit-lead-utility').value = meta.grid_utility || '';
  document.getElementById('edit-lead-street').value = meta.property_address || '';
  
  if (editLeadModal) editLeadModal.classList.add('open');
};

const toggleEditLeadModal = (show) => {
  if (editLeadModal) {
    if (show) editLeadModal.classList.add('open');
    else editLeadModal.classList.remove('open');
  }
};

if (closeEditLeadBtn) closeEditLeadBtn.addEventListener('click', () => toggleEditLeadModal(false));
if (cancelEditLeadBtn) cancelEditLeadBtn.addEventListener('click', () => toggleEditLeadModal(false));

if (editLeadForm) {
  editLeadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const full_name = document.getElementById('edit-lead-name').value.trim();
    const phone = document.getElementById('edit-lead-phone').value.trim();
    const email = document.getElementById('edit-lead-email').value.trim();
    const monthly_bill = document.getElementById('edit-lead-bill').value;
    const currency = document.getElementById('edit-lead-currency').value;
    const country = document.getElementById('edit-lead-country').value;
    const state_region = document.getElementById('edit-lead-state').value.trim();
    const city_municipality = document.getElementById('edit-lead-city').value.trim();
    const grid_utility = document.getElementById('edit-lead-utility').value.trim();
    const property_address = document.getElementById('edit-lead-street').value.trim();
    
    const payload = {
      full_name,
      phone,
      email: email || null,
      monthly_bill: monthly_bill ? parseFloat(monthly_bill) : null,
      metadata: {
        currency,
        country,
        state_region,
        city_municipality,
        grid_utility,
        property_address
      }
    };
    
    try {
      const res = await fetch(`/api/v1/leads/${editLeadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        toggleEditLeadModal(false);
        await loadData();
      } else {
        const errData = await res.json();
        alert(`Failed to update lead: ${errData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[Leads] Update error:', err);
      alert('Failed to connect to API server.');
    }
  });
}

// Location Filter listeners
const refreshViewsOnFilter = () => {
  renderKanban();
  renderContactsTable();
};

if (filterCountry) filterCountry.addEventListener('change', refreshViewsOnFilter);
if (filterState) filterState.addEventListener('input', refreshViewsOnFilter);
if (filterCity) filterCity.addEventListener('input', refreshViewsOnFilter);

if (clearLocationBtn) {
  clearLocationBtn.addEventListener('click', () => {
    if (filterCountry) filterCountry.value = 'all';
    if (filterState) filterState.value = '';
    if (filterCity) filterCity.value = '';
    refreshViewsOnFilter();
  });
}

// Client Proposal Generator Logic
if (inspectGenerateProposalBtn) {
  inspectGenerateProposalBtn.addEventListener('click', () => {
    const lead = leads.find(l => l.id === activeInspectorLeadId);
    if (!lead) return;
    
    proposalDate.textContent = new Date().toLocaleDateString();
    proposalQuoteId.textContent = `APX-Q-${lead.id.slice(0, 8).toUpperCase()}`;
    proposalClientName.textContent = lead.full_name;
    proposalClientPhone.textContent = lead.phone;
    proposalClientEmail.textContent = lead.email || 'Not provided';
    proposalClientAddress.textContent = lead.metadata?.property_address || lead.metadata?.street_address || 'Site Address';
    proposalClientUtility.textContent = lead.metadata?.utility_provider || 'Local Grid';
    
    const meta = lead.metadata || {};
    const currency = meta.currency || 'PHP';
    const isCommercial = meta.property_type === 'commercial';

    const requirements = isCommercial ? [
      { sku: 'APX-PAN-550M', name: 'Apex Mono 550W Solar Panel', qty: 40, unit: 8500 },
      { sku: 'APX-INV-10HY', name: 'Apex Hybrid Inverter 10kW', qty: 2, unit: 85000 },
      { sku: 'APX-BAT-LFP10', name: 'Apex LFP Battery Unit 10.24kWh', qty: 2, unit: 110000 }
    ] : [
      { sku: 'APX-PAN-400M', name: 'Apex Compact 400W Panel', qty: 10, unit: 6200 },
      { sku: 'APX-INV-05HY', name: 'Apex Hybrid Inverter 5kW', qty: 1, unit: 48000 },
      { sku: 'APX-BAT-LFP10', name: 'Apex LFP Battery Unit 10.24kWh', qty: 1, unit: 110000 }
    ];

    let exchangeRate = 1.0;
    if (currency === 'USD') exchangeRate = 56.0;
    else if (currency === 'EUR') exchangeRate = 60.0;
    else if (currency === 'GBP') exchangeRate = 70.0;

    proposalHardwareTbody.innerHTML = '';
    let totalProposalValue = 0;
    
    requirements.forEach(req => {
      const unitCostConverted = req.unit / exchangeRate;
      const subtotal = unitCostConverted * req.qty;
      totalProposalValue += subtotal;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: left;">
          <strong style="color: #0f172a; font-weight: 700;">${req.name}</strong><br>
          <span style="font-family: monospace; font-size: 10px; color: #64748b;">SKU: ${req.sku}</span>
        </td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${req.qty}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; color: #334155;">${formatCurrency(unitCostConverted, currency)}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0f172a;">${formatCurrency(subtotal, currency)}</td>
      `;
      proposalHardwareTbody.appendChild(tr);
    });

    const trTotal = document.createElement('tr');
    trTotal.style.background = '#f8fafc';
    trTotal.innerHTML = `
      <td colspan="3" style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; font-weight: 700; color: #0f172a;">Total Installed Proposal Price:</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; font-weight: 800; color: #ea580c; font-size: 13px;">${formatCurrency(totalProposalValue, currency)}</td>
    `;
    proposalHardwareTbody.appendChild(trTotal);

    const monthlyBill = parseFloat(lead.monthly_bill) || 0;
    const yearlySavings = monthlyBill * 12 * 0.85;
    const paybackPeriod = yearlySavings > 0 ? (totalProposalValue / yearlySavings) : 0;
    
    proposalRoiPayback.textContent = paybackPeriod > 0 ? `${paybackPeriod.toFixed(1)} Years` : '—';
    proposalRoiYearly.textContent = formatCurrency(yearlySavings, currency);
    
    let totalSavings = 0;
    let currentAnnualSavings = yearlySavings;
    for (let yr = 1; yr <= 25; yr++) {
      totalSavings += currentAnnualSavings;
      currentAnnualSavings *= 1.045;
    }
    proposalRoiCumulative.textContent = formatCurrency(totalSavings - totalProposalValue, currency);

    const monthlyKWh = monthlyBill * (currency === 'PHP' ? 0.1 : 6.0);
    const annualKWhOffset = monthlyKWh * 12 * 0.85;
    const co2SavedTons = (annualKWhOffset * 0.5) / 1000.0;
    const treesEquivalent = Math.round(co2SavedTons * 45);
    const coalBurnedAvoided = co2SavedTons * 450;

    proposalEcoTrees.textContent = `${treesEquivalent.toLocaleString()} Trees`;
    proposalEcoCo2.textContent = `${co2SavedTons.toFixed(1)} Tons / yr`;
    proposalEcoCoal.textContent = `${Math.round(coalBurnedAvoided).toLocaleString()} kg`;

    const ctx = proposalSigCanvas.getContext('2d');
    ctx.clearRect(0, 0, proposalSigCanvas.width, proposalSigCanvas.height);
    
    if (lead.metadata && lead.metadata.signature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
      };
      img.src = lead.metadata.signature;
    }
    
    proposalModal.style.display = 'flex';
  });
}

if (closeProposalModalBtn) {
  closeProposalModalBtn.addEventListener('click', () => {
    proposalModal.style.display = 'none';
  });
}

// Signature Pad Canvas drawing controls
let drawing = false;

function getMousePos(canvasDom, touchOrMouseEvent) {
  const rect = canvasDom.getBoundingClientRect();
  const clientX = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientX : touchOrMouseEvent.clientX;
  const clientY = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientY : touchOrMouseEvent.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

if (proposalSigCanvas) {
  const ctx = proposalSigCanvas.getContext('2d');
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  
  proposalSigCanvas.addEventListener('mousedown', (e) => {
    drawing = true;
    const pos = getMousePos(proposalSigCanvas, e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });

  proposalSigCanvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const pos = getMousePos(proposalSigCanvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });

  window.addEventListener('mouseup', () => {
    drawing = false;
  });

  proposalSigCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    drawing = true;
    const pos = getMousePos(proposalSigCanvas, e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });

  proposalSigCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!drawing) return;
    const pos = getMousePos(proposalSigCanvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });

  proposalSigCanvas.addEventListener('touchend', () => {
    drawing = false;
  });
}

if (clearSigBtn) {
  clearSigBtn.addEventListener('click', () => {
    const ctx = proposalSigCanvas.getContext('2d');
    ctx.clearRect(0, 0, proposalSigCanvas.width, proposalSigCanvas.height);
  });
}

if (printProposalBtn) {
  printProposalBtn.addEventListener('click', () => {
    window.print();
  });
}

if (saveProposalBtn) {
  saveProposalBtn.addEventListener('click', async () => {
    if (!activeInspectorLeadId) return;
    
    try {
      const signatureDataUrl = proposalSigCanvas.toDataURL();
      const lead = leads.find(l => l.id === activeInspectorLeadId);
      const meta = lead ? (lead.metadata || {}) : {};

      // Save proposal signature under metadata
      await fetch(`/api/v1/leads/${activeInspectorLeadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: {
            ...meta,
            signature: signatureDataUrl
          }
        })
      });

      const response = await fetch(`/api/v1/leads/${activeInspectorLeadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: 'won' })
      });
      
      if (response.ok) {
        await fetch(`/api/v1/leads/${activeInspectorLeadId}/simulate-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Proposal signed and accepted. Digital signature accepted.`,
            type: 'email'
          })
        });
        
        alert('Proposal successfully signed and project stage advanced to WON! Logistics matched.');
        proposalModal.style.display = 'none';
        inspectorModal.style.display = 'none';
        await loadData();
      } else {
        alert('Failed to update project stage.');
      }
    } catch (err) {
      console.error('[Proposal] Acceptance error:', err);
      alert('Failed to establish contact with server.');
    }
  });
}

// Load Inventory Stock
async function loadInventory() {
  try {
    const res = await fetch('/api/v1/inventory');
    if (!res.ok) throw new Error('API server returned error status');
    const data = await res.json();
    inventory = data.inventory || [];
    renderInventoryTable();
  } catch (err) {
    console.error('[Inventory] Load error:', err);
    inventoryTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--danger); padding: 30px;">
          Failed to fetch inventory from server. Check node connection.
        </td>
      </tr>
    `;
  }
}

// Render Inventory Table
function renderInventoryTable() {
  if (!inventoryTbody) return;
  const categoryFilter = inventoryFilterCategory.value;
  inventoryTbody.innerHTML = '';
  
  const filteredInv = inventory.filter(item => {
    return categoryFilter === 'all' || item.category === categoryFilter;
  });
  
  if (filteredInv.length === 0) {
    inventoryTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
          No hardware items listed in this category.
        </td>
      </tr>
    `;
    return;
  }
  
  filteredInv.forEach(item => {
    const tr = document.createElement('tr');
    const totalValue = item.quantity * item.unit_cost;
    
    const flagMap = { PH: '🇵🇭', CN: '🇨🇳', US: '🇺🇸', GB: '🇬🇧', AU: '🇦🇺', CA: '🇨🇦', DE: '🇩🇪' };
    const flag = flagMap[item.warehouse_country] || '📍';

    tr.innerHTML = `
      <td style="font-family: monospace; font-weight: 700; color: #818cf8;">${item.sku}</td>
      <td style="font-weight: 600; color: #fff;">${item.name}</td>
      <td><span class="badge" style="background: rgba(255,255,255,0.04); color: var(--text-light); font-size: 10px;">${item.category}</span></td>
      <td style="font-weight: 500; font-size: 13px;">${flag} ${item.warehouse_country}</td>
      <td style="text-align: center;">
        <div class="qty-adjuster">
          <button class="qty-btn" id="qty-dec-${item.id}">-</button>
          <input type="number" id="qty-val-${item.id}" value="${item.quantity}" readonly style="width: 40px; background: transparent; border: none; text-align: center; color: white;">
          <button class="qty-btn" id="qty-inc-${item.id}">+</button>
        </div>
      </td>
      <td>${formatCurrency(item.unit_cost, item.currency)}</td>
      <td style="font-weight: 600; color: var(--success);">${formatCurrency(totalValue, item.currency)}</td>
      <td style="max-width: 220px; font-size: 11px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${item.specs}">${item.specs || '<span style="opacity: 0.3;">No specs provided</span>'}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" id="inv-edit-${item.id}">
            Edit
          </button>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--danger); border-color: rgba(239, 68, 68, 0.2);" id="inv-del-${item.id}">
            Delete
          </button>
        </div>
      </td>
    `;
    
    inventoryTbody.appendChild(tr);
    
    // Bind plus / minus clicks
    document.getElementById(`qty-dec-${item.id}`).addEventListener('click', () => adjustStock(item.id, item.quantity - 1));
    document.getElementById(`qty-inc-${item.id}`).addEventListener('click', () => adjustStock(item.id, item.quantity + 1));
    
    // Bind edit / delete clicks
    document.getElementById(`inv-edit-${item.id}`).addEventListener('click', () => openEditInventoryModal(item));
    document.getElementById(`inv-del-${item.id}`).addEventListener('click', () => deleteInventoryItem(item.id));
  });
}

// Adjust quantity PATCH
async function adjustStock(itemId, newQty) {
  if (newQty < 0) return;
  try {
    const res = await fetch(`/api/v1/inventory/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQty })
    });
    if (res.ok) {
      // update local array
      const idx = inventory.findIndex(i => i.id === itemId);
      if (idx !== -1) inventory[idx].quantity = newQty;
      renderInventoryTable();
    }
  } catch (err) {
    console.error('[Inventory] Adjust stock error:', err);
  }
}

// Delete inventory item
async function deleteInventoryItem(itemId) {
  if (!confirm('Are you sure you want to remove this equipment from stock records?')) return;
  try {
    const res = await fetch(`/api/v1/inventory/${itemId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      inventory = inventory.filter(i => i.id !== itemId);
      renderInventoryTable();
    }
  } catch (err) {
    console.error('[Inventory] Delete error:', err);
  }
}

// Inventory filters listener
if (inventoryFilterCategory) inventoryFilterCategory.addEventListener('change', renderInventoryTable);

// Inventory Modals Toggle
const toggleInvModal = (show) => {
  if (inventoryModal) {
    if (show) inventoryModal.classList.add('open');
    else inventoryModal.classList.remove('open');
  }
};

if (openInvModalBtn) {
  openInvModalBtn.addEventListener('click', () => {
    editInventoryId = null;
    const title = document.getElementById('inventory-modal-title');
    if (title) title.textContent = 'Add Equipment to Inventory';
    if (inventoryForm) inventoryForm.reset();
    toggleInvModal(true);
  });
}

window.openEditInventoryModal = (item) => {
  editInventoryId = item.id;
  const title = document.getElementById('inventory-modal-title');
  if (title) title.textContent = 'Edit Equipment Details';
  
  document.getElementById('inv-sku').value = item.sku;
  document.getElementById('inv-category').value = item.category;
  document.getElementById('inv-name').value = item.name;
  document.getElementById('inv-quantity').value = item.quantity;
  document.getElementById('inv-unit-cost').value = item.unit_cost;
  document.getElementById('inv-currency').value = item.currency;
  document.getElementById('inv-warehouse-country').value = item.warehouse_country;
  document.getElementById('inv-specs').value = item.specs || '';
  
  toggleInvModal(true);
};

const exportInvBtn = document.getElementById('export-inv-btn');
if (exportInvBtn) {
  exportInvBtn.addEventListener('click', () => {
    if (inventory.length === 0) {
      alert('No inventory records available to export.');
      return;
    }

    const headers = ['SKU', 'Model Name', 'Category', 'Warehouse Country', 'Qty On Hand', 'Unit Cost', 'Total Value', 'Specifications'];
    
    const csvRows = [
      headers.join(','),
      ...inventory.map(item => [
        item.sku,
        `"${item.name.replace(/"/g, '""')}"`,
        item.category,
        item.warehouse_country,
        item.quantity,
        item.unit_cost,
        item.quantity * item.unit_cost,
        `"${(item.specs || '').replace(/"/g, '""')}"`
      ].join(','))
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

if (closeInvModalBtn) closeInvModalBtn.addEventListener('click', () => toggleInvModal(false));
if (cancelInvModalBtn) cancelInvModalBtn.addEventListener('click', () => toggleInvModal(false));

// Form submit
if (inventoryForm) {
  inventoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const sku = document.getElementById('inv-sku').value;
    const category = document.getElementById('inv-category').value;
    const name = document.getElementById('inv-name').value;
    const quantity = document.getElementById('inv-quantity').value;
    const unit_cost = document.getElementById('inv-unit-cost').value;
    const currency = document.getElementById('inv-currency').value;
    const specs = document.getElementById('inv-specs').value;
    const warehouse_country = document.getElementById('inv-warehouse-country').value;
    
    const payload = {
      sku, category, name, quantity, unit_cost, currency, specs, warehouse_country
    };
    
    const url = editInventoryId ? `/api/v1/inventory/${editInventoryId}` : '/api/v1/inventory';
    const method = editInventoryId ? 'PATCH' : 'POST';
    
    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        toggleInvModal(false);
        await loadInventory();
      } else {
        const data = await res.json();
        alert(`Failed to save item: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[Inventory] Save item error:', err);
      alert('Failed to connect to API server.');
    }
  });
}

// Global fulfillment supply order dispatcher
window.requestSupplyOrder = async (leadId, sku, partnerCountry, qty, itemName) => {
  if (!confirm(`Do you want to send a partner supply order request to ${partnerCountry} to ship ${qty}x ${itemName} to the installation site?`)) return;
  
  try {
    const res = await fetch(`/api/v1/leads/${leadId}/supply-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_sku: sku,
        partner_country: partnerCountry,
        quantity: parseInt(qty),
        item_name: itemName
      })
    });
    
    if (res.ok) {
      alert(`Supply request order dispatched to China partner! The partner has reserved and scheduled delivery for the missing component.`);
      await loadData(); // Reload inventory in tabs and logs
      const updatedLead = leads.find(l => l.id === leadId);
      if (updatedLead) openInspector(updatedLead);
    } else {
      const data = await res.json();
      alert(`Failed to request supply order: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('[Fulfillment] Request error:', err);
    alert('Failed to establish contact with dispatch routing server.');
  }
};

function populateSmsReplyDropdown() {
  if (!smsReplyLeadSelect) return;
  const currentSelection = smsReplyLeadSelect.value;
  smsReplyLeadSelect.innerHTML = '<option value="">Select Lead...</option>';
  
  leads.forEach(lead => {
    const opt = document.createElement('option');
    opt.value = lead.id;
    opt.textContent = `${lead.full_name} (${lead.phone})`;
    if (lead.id === currentSelection) {
      opt.selected = true;
    }
    smsReplyLeadSelect.appendChild(opt);
  });
}

if (smsReplySendBtn) {
  smsReplySendBtn.addEventListener('click', async () => {
    const leadId = smsReplyLeadSelect.value;
    const msgText = smsReplyText.value.trim();
    if (!leadId) {
      alert('Please select a lead to simulate replies for.');
      return;
    }
    if (!msgText) {
      alert('Please enter a mock message reply text.');
      return;
    }

    try {
      const response = await fetch(`/api/v1/leads/${leadId}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          type: 'sms'
        })
      });

      if (response.ok) {
        smsReplyText.value = '';
        await loadData();
        // If the fulfillment tab is open, reload it too
        const activeTabBtn = document.querySelector('.tab-btn.active');
        if (activeTabBtn && activeTabBtn.getAttribute('data-tab') === 'inventory-view') {
          await loadFulfillment();
        }
      } else {
        const data = await response.json();
        alert(`Failed to send mock reply: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('[SMS Simulator] Reply post failure:', err);
      alert('Failed to connect to API server.');
    }
  });
}

let leafletMap = null;
let mapMarkers = [];

function initMap() {
  if (typeof L === 'undefined') {
    console.warn('[Map] Leaflet.js library not loaded yet.');
    return;
  }
  
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;
  
  if (leafletMap) {
    setTimeout(() => {
      leafletMap.invalidateSize();
      renderMapMarkers();
    }, 100);
    return;
  }

  // Focus initially on Philippines
  leafletMap = L.map('map', {
    zoomControl: true,
    maxZoom: 18,
    minZoom: 2
  }).setView([12.8797, 121.7740], 6);

  // CartoDB Dark Matter tiles (premium dark mode appearance)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(leafletMap);

  renderMapMarkers();
}

function renderMapMarkers() {
  try {
    if (!leafletMap) return;
    
    // Clear existing markers
    mapMarkers.forEach(marker => {
      try {
        leafletMap.removeLayer(marker);
      } catch (e) {}
    });
    mapMarkers = [];

    const cityCoordinates = {
      // Philippines
      'manila': [14.5995, 120.9842],
      'quezon': [14.6760, 121.0437],
      'cebu': [10.3157, 123.8854],
      'davao': [7.1907, 125.4553],
      'iloilo': [10.7202, 122.5621],
      'makati': [14.5547, 121.0244],
      'pasig': [14.5764, 121.0851],
      'cagayan de oro': [8.4542, 124.6319],
      'bacolod': [10.6667, 122.9500],
      'taguig': [14.5176, 121.0509],
      'antipolo': [14.5845, 121.1754],
      // US
      'chicago': [41.8781, -87.6298],
      'new york': [40.7128, -74.0060],
      'san francisco': [37.7749, -122.4194],
      'houston': [29.7604, -95.3698],
      // UK
      'london': [51.5074, -0.1278],
      // Germany
      'berlin': [52.5200, 13.4050],
      // Australia
      'sydney': [-33.8688, 151.2093]
    };

    const countryCoordinates = {
      'PH': [12.8797, 121.7740],
      'US': [37.0902, -95.7129],
      'GB': [55.3781, -3.4360],
      'DE': [51.1657, 10.4515],
      'AU': [-25.2744, 133.7751]
    };

    const stageColors = {
      'new': '#6366f1',
      'contacted': '#3b82f6',
      'estimate_scheduled': '#f59e0b',
      'closed_won': '#10b981',
      'closed_lost': '#ef4444'
    };

    const coordinatesRecord = {};

    leads.forEach(lead => {
      const meta = lead.metadata || {};
      const country = meta.country || 'PH';
      const city = String(meta.city_municipality || '').toLowerCase().trim();
      
      let coords = [12.8797, 121.7740]; // Default PH coordinates
      if (meta.latitude && meta.longitude) {
        coords = [parseFloat(meta.latitude), parseFloat(meta.longitude)];
      } else if (city && cityCoordinates[city]) {
        coords = [...cityCoordinates[city]];
      } else if (country && countryCoordinates[country]) {
        coords = [...countryCoordinates[country]];
      }

      if (isNaN(coords[0]) || isNaN(coords[1])) {
        coords = [12.8797, 121.7740]; // Safe default fallback
      }
      
      const key = `${coords[0].toFixed(3)},${coords[1].toFixed(3)}`;
      if (coordinatesRecord[key]) {
        coords[0] += (Math.random() - 0.5) * 0.04;
        coords[1] += (Math.random() - 0.5) * 0.04;
      } else {
        coordinatesRecord[key] = true;
      }

      const color = stageColors[lead.pipeline_stage] || '#6366f1';
      
      const marker = L.circleMarker(coords, {
        radius: 8,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85
      });

      const billFormatted = formatCurrency(lead.monthly_bill || 0, meta.currency || 'PHP');
      const serviceLabel = (lead.service_type || 'solar').toUpperCase();

      const popupContent = `
        <div style="font-family: sans-serif; color: #111; font-size: 11px; min-width: 160px; line-height: 1.4;">
          <strong style="font-size: 13px; color: #0f172a; display: block; margin-bottom: 2px;">${lead.full_name}</strong>
          <span style="display: inline-block; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 9px; text-transform: uppercase; margin-bottom: 6px;">
            ${serviceLabel}
          </span>
          <div style="margin-bottom: 2px;"><strong>Stage:</strong> <span style="text-transform: capitalize; color: #ea580c; font-weight: 600;">${lead.pipeline_stage.replace('_', ' ')}</span></div>
          <div style="margin-bottom: 2px;"><strong>Utility Bill:</strong> <span>${billFormatted}</span></div>
          <div style="margin-bottom: 6px;"><strong>Location:</strong> <span>${meta.city_municipality || '—'}, ${country}</span></div>
          
          <button class="btn btn-primary" style="padding: 6px 10px; font-weight: 700; font-size: 10px; width: 100%; border-radius: 4px; background: #ea580c; border-color: #ea580c; color: #fff; cursor: pointer; box-shadow: 0 2px 6px rgba(234,88,12,0.2);" onclick="openInspectorFromMap('${lead.id}')">
            Inspect Lead Details 🔍
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.addTo(leafletMap);
      mapMarkers.push(marker);
    });

    if (mapMarkers.length > 0) {
      const group = new L.featureGroup(mapMarkers);
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        leafletMap.fitBounds(bounds.pad(0.15));
      }
    }
  } catch (err) {
    console.error('[Map] renderMapMarkers error:', err);
  }
}

window.openInspectorFromMap = (leadId) => {
  const lead = leads.find(l => l.id === leadId);
  if (lead) {
    openInspector(lead);
    if (leafletMap) leafletMap.closePopup();
  }
};

window.showDispatchForm = (orderId) => {
  const btn = document.getElementById(`dispatch-btn-${orderId}`);
  const container = document.getElementById(`dispatch-form-container-${orderId}`);
  if (btn) btn.style.display = 'none';
  if (container) container.style.display = 'flex';
};

window.hideDispatchForm = (orderId) => {
  const btn = document.getElementById(`dispatch-btn-${orderId}`);
  const container = document.getElementById(`dispatch-form-container-${orderId}`);
  if (btn) btn.style.display = 'block';
  if (container) container.style.display = 'none';
};

window.submitShipmentDispatch = async (orderId) => {
  const carrier = document.getElementById(`input-carrier-${orderId}`).value.trim();
  const tracking = document.getElementById(`input-tracking-${orderId}`).value.trim();
  const eta = document.getElementById(`input-eta-${orderId}`).value.trim();

  if (!carrier || !tracking || !eta) {
    alert('Please fill out all shipping fields.');
    return;
  }

  try {
    const res = await fetch(`/api/v1/leads/fulfillment/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'in_transit',
        carrier,
        tracking_number: tracking,
        estimated_delivery: eta
      })
    });
    
    if (res.ok) {
      await loadFulfillment();
      await loadData();
    } else {
      alert('Failed to update shipping status.');
    }
  } catch (err) {
    console.error('[Fulfillment] Dispatch error:', err);
    alert('Connection error.');
  }
};
