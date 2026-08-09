-- Create the leads table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    service_type TEXT,
    monthly_bill NUMERIC,
    pipeline_stage TEXT NOT NULL DEFAULT 'new' CHECK (pipeline_stage IN ('new', 'contacted', 'estimate_scheduled', 'closed_won', 'closed_lost')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Create the pipeline_logs table
CREATE TABLE IF NOT EXISTS pipeline_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Create automatic updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the updated_at trigger to the leads table
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) on both tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public/anonymous insertions to leads (for webhooks/forms)
CREATE POLICY "Allow public insert to leads" 
    ON leads 
    FOR INSERT 
    TO public 
    WITH CHECK (true);

-- Create policy to allow public/anonymous insertions to pipeline_logs
CREATE POLICY "Allow public insert to pipeline_logs" 
    ON pipeline_logs 
    FOR INSERT 
    TO public 
    WITH CHECK (true);

-- Also add policies to allow reads and updates by authenticated roles or service roles.
-- Since the API engine acts as a backend service, we enable general policies.
CREATE POLICY "Allow authenticated/service read leads" 
    ON leads 
    FOR SELECT 
    TO authenticated, service_role 
    USING (true);

CREATE POLICY "Allow authenticated/service update leads" 
    ON leads 
    FOR UPDATE 
    TO authenticated, service_role 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Allow authenticated/service read pipeline_logs" 
    ON pipeline_logs 
    FOR SELECT 
    TO authenticated, service_role 
    USING (true);

-- Create the inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PHP',
    specs TEXT DEFAULT '',
    warehouse_country TEXT NOT NULL DEFAULT 'PH'
);

-- Enable RLS on inventory
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Create policies for inventory
CREATE POLICY "Allow public select inventory"
    ON inventory
    FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Allow authenticated/service insert inventory"
    ON inventory
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK (true);

CREATE POLICY "Allow authenticated/service update inventory"
    ON inventory
    FOR UPDATE
    TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated/service delete inventory"
    ON inventory
    FOR DELETE
    TO authenticated, service_role
    USING (true);

-- Seed default inventory items
INSERT INTO inventory (id, sku, name, category, quantity, unit_cost, currency, specs, warehouse_country)
VALUES
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'APX-PAN-550M', 'Apex Mono 550W Solar Panel', 'Panels', 120, 8500, 'PHP', 'Monocrystalline, 21.3% Efficiency, IP68 Junction Box', 'PH'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'APX-PAN-400M', 'Apex Compact 400W Panel', 'Panels', 85, 6200, 'PHP', 'Residential sleek black layout, 120 Half-cells', 'PH'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'APX-INV-05HY', 'Apex Hybrid Inverter 5kW', 'Inverters', 15, 48000, 'PHP', 'Single Phase, Dual MPPT, Battery Ready, Wifi module', 'PH'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'APX-INV-10HY', 'Apex Hybrid Inverter 10kW', 'Inverters', 8, 72000, 'PHP', 'Three Phase, Triple MPPT, Parallel Stackable', 'CN'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'APX-BAT-LFP05', 'Apex LFP Battery Unit 5.12kWh', 'Batteries', 24, 85000, 'PHP', 'LiFePO4, 6000+ Cycles, Wall-mount stackable', 'PH'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', 'APX-BAT-LFP10', 'Apex LFP Battery Unit 10.24kWh', 'Batteries', 0, 148000, 'PHP', 'LiFePO4, high-discharge smart BMS, LCD Display', 'PH'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', 'APX-BAT-LFP10-CN', 'Apex LFP Battery Unit 10.24kWh (CN)', 'Batteries', 15, 130000, 'PHP', 'LiFePO4, high-discharge smart BMS, partner facility', 'CN'),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a18', 'APX-MNT-TIN', 'Apex Tin Roof Mount Kit', 'Mounting', 200, 1800, 'PHP', 'Al6005-T5 Aluminum rails, SUS304 bolts', 'PH')
ON CONFLICT (sku) DO NOTHING;
