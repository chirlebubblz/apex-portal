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
