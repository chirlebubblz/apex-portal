import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_FILE = path.join(process.cwd(), 'db.json');

const DEFAULT_INVENTORY = [
  {
    id: 'inv-1',
    sku: 'APX-PAN-550M',
    name: 'Apex Mono 550W Solar Panel',
    category: 'Panels',
    quantity: 120,
    unit_cost: 8500,
    currency: 'PHP',
    specs: 'Monocrystalline, 21.3% Efficiency, IP68 Junction Box',
    warehouse_country: 'PH',
    created_at: new Date().toISOString()
  },
  {
    id: 'inv-2',
    sku: 'APX-PAN-400M',
    name: 'Apex Compact 400W Panel',
    category: 'Panels',
    quantity: 85,
    unit_cost: 6200,
    currency: 'PHP',
    specs: 'Residential sleek black layout, 120 Half-cells',
    warehouse_country: 'PH',
    created_at: new Date().toISOString()
  },
  {
    id: 'inv-3',
    sku: 'APX-INV-05HY',
    name: 'Apex Hybrid Inverter 5kW',
    category: 'Inverters',
    quantity: 15,
    unit_cost: 48000,
    currency: 'PHP',
    specs: 'Single Phase, Dual MPPT, Battery Ready, Wifi module',
    warehouse_country: 'PH',
    created_at: new Date().toISOString()
  },
  {
    id: 'inv-4',
    sku: 'APX-INV-10HY',
    name: 'Apex Hybrid Inverter 10kW',
    category: 'Inverters',
    quantity: 8,
    unit_cost: 72000,
    currency: 'PHP',
    specs: 'Three Phase, Triple MPPT, Parallel Stackable',
    warehouse_country: 'CN',
    created_at: new Date().toISOString()
  },
  {
    id: 'inv-5',
    sku: 'APX-BAT-LFP05',
    name: 'Apex LFP Battery Unit 5.12kWh',
    category: 'Batteries',
    quantity: 24,
    unit_cost: 85000,
    currency: 'PHP',
    specs: 'LiFePO4, 6000+ Cycles, Wall-mount stackable',
    warehouse_country: 'PH',
    created_at: new Date().toISOString()
  },
  {
    id: 'inv-6',
    sku: 'APX-BAT-LFP10',
    name: 'Apex LFP Battery Unit 10.24kWh',
    category: 'Batteries',
    quantity: 0, // Depleted to trigger supply chain dispatches
    unit_cost: 148000,
    currency: 'PHP',
    specs: 'LiFePO4, high-discharge smart BMS, LCD Display',
    warehouse_country: 'PH',
    created_at: new Date().toISOString()
  },
  {
    id: 'inv-6-cn',
    sku: 'APX-BAT-LFP10-CN',
    name: 'Apex LFP Battery Unit 10.24kWh (CN)',
    category: 'Batteries',
    quantity: 15,
    unit_cost: 130000,
    currency: 'PHP',
    specs: 'LiFePO4, high-discharge smart BMS, partner facility',
    warehouse_country: 'CN',
    created_at: new Date().toISOString()
  },
  {
    id: 'inv-7',
    sku: 'APX-MNT-TIN',
    name: 'Apex Tin Roof Mount Kit',
    category: 'Mounting',
    quantity: 200,
    unit_cost: 1800,
    currency: 'PHP',
    specs: 'Al6005-T5 Aluminum rails, SUS304 bolts',
    warehouse_country: 'PH',
    created_at: new Date().toISOString()
  }
];

const DEFAULT_LEADS = [
  {
    id: 'lead-s1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    full_name: 'Alexander Wright',
    phone: '+639171234567',
    email: 'alex.wright@gmail.com',
    service_type: 'solar',
    monthly_bill: 12500,
    pipeline_stage: 'estimate_scheduled',
    metadata: {
      currency: 'PHP',
      property_type: 'residential',
      ownership_status: 'own',
      roof_type: 'metal',
      primary_goal: 'lower_bills',
      country: 'PH',
      state_region: 'Metro Manila',
      city_municipality: 'Pasig City',
      street_address: '12 Emerald Ave',
      utility_provider: 'Meralco',
      source: 'portal_manual_estimator'
    }
  },
  {
    id: 'lead-s2',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    full_name: 'Maria Santos',
    phone: '+639189876543',
    email: 'maria.santos@yahoo.com',
    service_type: 'solar',
    monthly_bill: 6200,
    pipeline_stage: 'contacted',
    metadata: {
      currency: 'PHP',
      property_type: 'residential',
      ownership_status: 'own',
      roof_type: 'concrete',
      primary_goal: 'backup_typhoons',
      country: 'PH',
      state_region: 'Cebu',
      city_municipality: 'Cebu City',
      street_address: '45 Mango Ave',
      utility_provider: 'VECO',
      source: 'portal_manual_estimator'
    }
  },
  {
    id: 'lead-s3',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    full_name: 'Apex B2B Warehouse',
    phone: '+15550192834',
    email: 'ops@apexwarehouse.com',
    service_type: 'commercial_solar',
    monthly_bill: 85000,
    pipeline_stage: 'new',
    metadata: {
      currency: 'USD',
      property_type: 'commercial',
      ownership_status: 'own',
      roof_type: 'metal',
      primary_goal: 'both',
      country: 'US',
      state_region: 'California',
      city_municipality: 'Los Angeles',
      street_address: '900 Airport Blvd',
      utility_provider: 'PG&E',
      source: 'portal_manual_estimator'
    }
  }
];

const DEFAULT_LOGS = DEFAULT_LEADS.map(lead => ({
  id: crypto.randomUUID(),
  created_at: new Date().toISOString(),
  lead_id: lead.id,
  event_type: 'lead_created',
  payload: { lead }
}));

interface DbData {
  leads: any[];
  logs: any[];
  sms: any[];
  fulfillment: any[];
  inventory: any[];
}

let dbCache: DbData | null = null;

export function getDb(): DbData {
  if (dbCache) return dbCache;

  const isTestEnv = process.env.PORT === '3002' || process.env.NODE_ENV === 'test';
  if (isTestEnv) {
    dbCache = {
      leads: [],
      logs: [],
      sms: [],
      fulfillment: [],
      inventory: JSON.parse(JSON.stringify(DEFAULT_INVENTORY))
    };
    return dbCache;
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      dbCache = {
        leads: parsed.leads || [],
        logs: parsed.logs || [],
        sms: parsed.sms || [],
        fulfillment: parsed.fulfillment || [],
        inventory: parsed.inventory || []
      };
      return dbCache!;
    } catch (err) {
      console.error('[DB] Failed to read db.json, falling back to seeds:', err);
    }
  }

  // Seed default data
  dbCache = {
    leads: [...DEFAULT_LEADS],
    logs: [...DEFAULT_LOGS],
    sms: [],
    fulfillment: [],
    inventory: JSON.parse(JSON.stringify(DEFAULT_INVENTORY))
  };

  saveDb(dbCache.leads, dbCache.logs, dbCache.sms, dbCache.fulfillment, dbCache.inventory);
  return dbCache!;
}

export function saveDb(leads: any[], logs: any[], sms: any[], fulfillment: any[], inventory: any[]) {
  dbCache = { leads, logs, sms, fulfillment, inventory };
  const isTestEnv = process.env.PORT === '3002' || process.env.NODE_ENV === 'test';
  if (isTestEnv) return;

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Failed to write db.json:', err);
  }
}
