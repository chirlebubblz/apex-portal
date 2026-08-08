import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { adjustMockStock } from './inventory';

dotenv.config();

const router = Router();

// Zod Schema for request validation
const leadIngestSchema = z.object({
  full_name: z.string().min(1, 'full_name is required'),
  phone: z.string().min(1, 'phone is required'),
  email: z.string().email('Invalid email address').optional().nullable(),
  service_type: z.string().optional().nullable(),
  monthly_bill: z.number().nonnegative('monthly_bill must be non-negative').optional().nullable(),
  metadata: z.record(z.any()).optional().default({})
});

// Helper for phone normalization
function normalizePhone(phoneStr: string): string | null {
  const hasPlus = phoneStr.trim().startsWith('+');
  const digits = phoneStr.replace(/\D/g, '');

  if (digits.length < 7) {
    return null; // Too short to be any valid phone number
  }

  // Try standard parsing first
  const parsed = parsePhoneNumberFromString(phoneStr, 'US');
  if (parsed && parsed.isValid()) {
    return parsed.format('E.164');
  }

  // Fallback to manual structuring to be extremely forgiving for demo inputs
  if (hasPlus) {
    return `+${digits}`;
  }
  
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  if (digits.length > 10) {
    return `+${digits}`;
  }

  // Fallback for short demo phone numbers (e.g. 7-9 digits)
  return `+1${digits}`;
}

// Supabase client initialization
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

import { getDb, saveDb } from './db';

// Determine if we should run in mock mode
const isMockMode = !supabaseUrl || !supabaseKey || process.env.MOCK_DB === 'true';

// In-memory databases for mock fallback mode connected to local file DB
const mockLeads = getDb().leads;
const mockLogs = getDb().logs;
const simulatedSms = getDb().sms;

export interface FulfillmentOrder {
  id: string;
  lead_id: string;
  lead_name: string;
  sku: string;
  item_name: string;
  quantity: number;
  source_warehouse: string;
  destination_country: string;
  status: 'pending_dispatch' | 'in_transit' | 'arrived' | 'installed';
  updated_at: string;
  carrier?: string;
  tracking_number?: string;
  estimated_delivery?: string;
}

export const mockFulfillmentOrders = getDb().fulfillment;

const save = () => {
  const db = getDb();
  saveDb(db.leads, db.logs, db.sms, db.fulfillment, db.inventory);
};

let supabase: any = null;
if (!isMockMode) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[Database] Supabase client initialized successfully.');
  } catch (err: any) {
    console.error('[Database] Failed to initialize Supabase client. Running in Mock Mode.', err.message);
  }
} else {
  console.log('[Database] Supabase credentials not found or MOCK_DB=true. Running in Mock Mode.');
}

// GET route to inspect current database state (useful for tests)
router.get('/leads', (req: Request, res: Response) => {
  if (isMockMode) {
    return res.status(200).json({ leads: mockLeads, logs: mockLogs });
  }
  return res.status(200).json({ message: 'Dynamic fetch not available in non-mock mode via API.' });
});

// GET route to poll simulated outbound SMS logs
router.get('/simulated-sms', (req: Request, res: Response) => {
  const since = req.query.since ? parseInt(req.query.since as string) : 0;
  const filtered = simulatedSms.filter(s => new Date(s.created_at).getTime() > since);
  return res.status(200).json({ sms: filtered });
});

// Mock n8n webhook receiver (useful for self-contained testing)
router.post('/mock-n8n-receiver', (req: Request, res: Response) => {
  console.log('[Mock n8n Webhook] Received payload:', JSON.stringify(req.body, null, 2));
  return res.status(200).json({ success: true, message: 'Payload received by mock n8n' });
});

// POST route for lead ingestion
router.post('/ingest', async (req: Request, res: Response) => {
  try {
    console.log('[Ingest] Received incoming payload:', req.body);

    // 1. Validate payload
    const validation = leadIngestSchema.safeParse(req.body);
    if (!validation.success) {
      console.warn('[Ingest] Validation failed:', validation.error.format());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.format()
      });
    }

    const leadData = validation.data;

    // 2. Normalize phone number
    const normalizedPhone = normalizePhone(leadData.phone);
    if (!normalizedPhone) {
      console.warn(`[Ingest] Phone normalization failed for input: "${leadData.phone}"`);
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Could not normalize to E.164.'
      });
    }

    console.log(`[Ingest] Phone normalized: "${leadData.phone}" -> "${normalizedPhone}"`);

    // Prepare lead object
    const newLead = {
      full_name: leadData.full_name,
      phone: normalizedPhone,
      email: leadData.email || null,
      service_type: leadData.service_type || null,
      monthly_bill: leadData.monthly_bill || null,
      pipeline_stage: 'new',
      metadata: leadData.metadata || {}
    };

    let leadId: string;
    let savedLead: any;

    // 3. Insert lead and pipeline log into database
    if (isMockMode || !supabase) {
      leadId = crypto.randomUUID();
      savedLead = {
        id: leadId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...newLead
      };
      mockLeads.push(savedLead);

      const logEntry = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: leadId,
        event_type: 'lead_created',
        payload: { lead: savedLead }
      };
      mockLogs.push(logEntry);

      console.log(`[Database (Mock)] Lead created with ID: ${leadId}`);
    } else {
      const { data: leadResult, error: leadError } = await supabase
        .from('leads')
        .insert([newLead])
        .select()
        .single();

      if (leadError) {
        console.error('[Database (Supabase)] Insert lead error:', leadError);
        return res.status(500).json({ success: false, error: 'Database error', details: leadError });
      }

      savedLead = leadResult;
      leadId = leadResult.id;
      console.log(`[Database (Supabase)] Lead created with ID: ${leadId}`);

      // Insert Log
      const { error: logError } = await supabase
        .from('pipeline_logs')
        .insert([{
          lead_id: leadId,
          event_type: 'lead_created',
          payload: { lead: savedLead }
        }]);

      if (logError) {
        console.warn('[Database (Supabase)] Failed to write pipeline_logs:', logError);
      }
    }

    // 4. Simulate Twilio Instant Automations for Ingestion Demo
    // In a live system, this runs inside n8n, but we trigger it in the outbox simulator for visual demonstration
    const customerSms = `Hi ${savedLead.full_name}, thanks for reaching out to Apex Climate & Solar. We received your request for ${savedLead.service_type || 'our services'} and will contact you shortly.`;
    const dispatcherSms = `ALERT: New Lead Received!\nName: ${savedLead.full_name}\nPhone: ${savedLead.phone}\nService: ${savedLead.service_type || 'Not specified'}\nBill: ${savedLead.monthly_bill ? '$' + savedLead.monthly_bill : 'Not provided'}`;

    simulatedSms.push({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      to: savedLead.phone,
      message: customerSms,
      type: 'customer_autoresponder'
    });

    simulatedSms.push({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      to: '+18005550123', // internal line
      message: dispatcherSms,
      type: 'internal_notification'
    });

    // Write log records for SMS actions
    if (isMockMode || !supabase) {
      mockLogs.push({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: leadId,
        event_type: 'sms_sent',
        payload: { to: savedLead.phone, message: customerSms, type: 'customer_autoresponder' }
      });
      mockLogs.push({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: leadId,
        event_type: 'sms_sent',
        payload: { to: '+18005550123', message: dispatcherSms, type: 'internal_notification' }
      });
      save();
    } else {
      await supabase.from('pipeline_logs').insert([
        {
          lead_id: leadId,
          event_type: 'sms_sent',
          payload: { to: savedLead.phone, message: customerSms, type: 'customer_autoresponder' }
        },
        {
          lead_id: leadId,
          event_type: 'sms_sent',
          payload: { to: '+18005550123', message: dispatcherSms, type: 'internal_notification' }
        }
      ]);
    }

    // 5. Fire Outbound Webhook to n8n
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (n8nWebhookUrl) {
      console.log(`[Webhook] Sending lead payload to n8n webhook: ${n8nWebhookUrl}`);
      try {
        const response = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(savedLead)
        });

        if (response.ok) {
          console.log(`[Webhook] Webhook sent successfully. Status: ${response.status}`);
        } else {
          console.warn(`[Webhook] Webhook call returned non-2xx status: ${response.status} ${response.statusText}`);
        }
      } catch (err: any) {
        console.error(`[Webhook] Webhook call failed to reach ${n8nWebhookUrl}:`, err.message);
      }
    } else {
      console.log('[Webhook] N8N_WEBHOOK_URL not configured. Webhook call skipped.');
    }

    // 6. Return success
    return res.status(201).json({
      success: true,
      lead_id: leadId
    });

  } catch (error: any) {
    console.error('[Ingest] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// PATCH: General update route for lead information
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id;
    const { full_name, phone, email, monthly_bill, service_type, metadata } = req.body;

    if (isMockMode || !supabase) {
      const idx = mockLeads.findIndex(l => l.id === leadId);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      const oldLead = { ...mockLeads[idx] };

      if (full_name !== undefined) mockLeads[idx].full_name = full_name;
      if (phone !== undefined) {
        const normalized = normalizePhone(phone);
        if (!normalized) {
          return res.status(400).json({ success: false, error: 'Invalid phone format' });
        }
        mockLeads[idx].phone = normalized;
      }
      if (email !== undefined) mockLeads[idx].email = email || null;
      if (service_type !== undefined) mockLeads[idx].service_type = service_type || null;
      if (monthly_bill !== undefined) mockLeads[idx].monthly_bill = monthly_bill !== null ? parseFloat(monthly_bill) : null;
      if (metadata !== undefined) {
        mockLeads[idx].metadata = { ...mockLeads[idx].metadata, ...metadata };
      }
      mockLeads[idx].updated_at = new Date().toISOString();

      // Log updates
      mockLogs.push({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: leadId,
        event_type: 'lead_updated',
        payload: { old: oldLead, updated: mockLeads[idx], trigger: 'dashboard_api' }
      });
      save();

      return res.status(200).json({ success: true, lead: mockLeads[idx] });
    }

    const updates: any = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        return res.status(400).json({ success: false, error: 'Invalid phone format' });
      }
      updates.phone = normalized;
    }
    if (email !== undefined) updates.email = email || null;
    if (service_type !== undefined) updates.service_type = service_type || null;
    if (monthly_bill !== undefined) updates.monthly_bill = monthly_bill !== null ? parseFloat(monthly_bill) : null;
    if (metadata !== undefined) updates.metadata = metadata;
    updates.updated_at = new Date().toISOString();

    const { data: leadResult, error: leadError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single();

    if (leadError) throw leadError;

    // Log updates
    await supabase.from('pipeline_logs').insert([{
      lead_id: leadId,
      event_type: 'lead_updated',
      payload: { updates, trigger: 'dashboard_api' }
    }]);

    return res.status(200).json({ success: true, lead: leadResult });
  } catch (error: any) {
    console.error('[Leads/Update] General update error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH route to update a lead's pipeline stage
router.patch('/:id/stage', async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id;
    
    // 1. Validate payload
    const stageUpdateSchema = z.object({
      pipeline_stage: z.enum(['new', 'contacted', 'estimate_scheduled', 'closed_won', 'closed_lost'])
    });

    const validation = stageUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.format()
      });
    }

    const { pipeline_stage } = validation.data;
    let updatedLead: any;
    let oldStage = '';

    // 2. Update lead in DB
    if (isMockMode || !supabase) {
      const leadIndex = mockLeads.findIndex((l: any) => l.id === leadId);
      if (leadIndex === -1) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      oldStage = mockLeads[leadIndex].pipeline_stage;
      mockLeads[leadIndex].pipeline_stage = pipeline_stage;
      mockLeads[leadIndex].updated_at = new Date().toISOString();
      updatedLead = mockLeads[leadIndex];

      // Add audit log
      mockLogs.push({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: leadId,
        event_type: 'stage_updated',
        payload: { from: oldStage, to: pipeline_stage, trigger: 'dashboard_api' }
      });

      console.log(`[Database (Mock)] Lead ${leadId} stage updated from ${oldStage} to ${pipeline_stage}`);
    } else {
      // First fetch old stage for logging
      const { data: oldLead, error: oldLeadError } = await supabase
        .from('leads')
        .select('pipeline_stage')
        .eq('id', leadId)
        .single();

      if (oldLeadError || !oldLead) {
        return res.status(404).json({ success: false, error: 'Lead not found or error loading old record' });
      }

      oldStage = oldLead.pipeline_stage;

      const { data: leadResult, error: leadError } = await supabase
        .from('leads')
        .update({ pipeline_stage })
        .eq('id', leadId)
        .select()
        .single();

      if (leadError) {
        return res.status(500).json({ success: false, error: 'Database update error', details: leadError });
      }

      updatedLead = leadResult;

      // Log insert
      const { error: logError } = await supabase
        .from('pipeline_logs')
        .insert([{
          lead_id: leadId,
          event_type: 'stage_updated',
          payload: { from: oldStage, to: pipeline_stage, trigger: 'dashboard_api' }
        }]);

      if (logError) {
        console.warn('[Database (Supabase)] Failed to write pipeline_logs:', logError);
      }
    }

    // 3. Stage Change Automation Rules (Triggers automated GHL-style outbound SMS texts)
    let stageSms = '';
    if (pipeline_stage === 'estimate_scheduled') {
      stageSms = `Hi ${updatedLead.full_name}, your Apex Climate & Solar appointment is confirmed! A technician will arrive shortly.`;
    } else if (pipeline_stage === 'closed_won') {
      stageSms = `Hi ${updatedLead.full_name}, welcome to the Apex Climate & Solar family! We are excited to get started on your project.`;
    }

    if (stageSms) {
      simulatedSms.push({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        to: updatedLead.phone,
        message: stageSms,
        type: 'stage_automation'
      });

      // Log the automated SMS sent event
      if (isMockMode || !supabase) {
        mockLogs.push({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          lead_id: leadId,
          event_type: 'sms_sent',
          payload: { to: updatedLead.phone, message: stageSms, type: 'stage_automation' }
        });
      } else {
        await supabase.from('pipeline_logs').insert([{
          lead_id: leadId,
          event_type: 'sms_sent',
          payload: { to: updatedLead.phone, message: stageSms, type: 'stage_automation' }
        }]);
      }
    }

    if (isMockMode || !supabase) {
      save();
    }

    return res.status(200).json({
      success: true,
      lead: updatedLead
    });

  } catch (error: any) {
    console.error('[Ingest/Stage] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE: Remove a lead record
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isMockMode || !supabase) {
      const idx = mockLeads.findIndex(lead => lead.id === id);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Lead record not found' });
      }
      
      mockLogs.push({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: id,
        event_type: 'lead_deleted',
        payload: { name: mockLeads[idx].full_name }
      });
      
      mockLeads.splice(idx, 1);
      save();
      return res.status(200).json({ success: true });
    }

    await supabase.from('pipeline_logs').delete().eq('lead_id', id);

    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[Leads/Delete] Deletion error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Send supply request to partner in another country (e.g. China)
router.post('/:id/supply-request', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { item_sku, partner_country, quantity, item_name } = req.body;

    if (!item_sku || !partner_country || !quantity) {
      return res.status(400).json({ success: false, error: 'Missing supply request parameters' });
    }

    let leadName = 'Lead';
    let leadPhone = '';
    let leadAddress = 'Installation Site';

    if (isMockMode || !supabase) {
      const lead = mockLeads.find(l => l.id === id);
      if (lead) {
        leadName = lead.full_name;
        leadPhone = lead.phone;
        leadAddress = lead.metadata?.property_address || 'Installation Site';
      }
    } else {
      const { data: lead, error } = await supabase.from('leads').select('*').eq('id', id).single();
      if (!error && lead) {
        leadName = lead.full_name;
        leadPhone = lead.phone;
        leadAddress = lead.metadata?.property_address || 'Installation Site';
      }
    }

    if (isMockMode || !supabase) {
      adjustMockStock(item_sku, -quantity);
    }

    const logMsg = `[Fulfillment Request] Dispatched supply request to partner in ${partner_country}. Ship ${quantity}x ${item_name || item_sku} to ${leadName} at ${leadAddress}. partner notified.`;
    
    const auditId = crypto.randomUUID();
    const logEntry = {
      id: auditId,
      created_at: new Date().toISOString(),
      lead_id: id,
      event_type: 'sms_sent',
      payload: {
        to: leadPhone,
        message: logMsg,
        type: 'supply_chain_request',
        item_sku,
        partner_country,
        quantity
      }
    };

    if (isMockMode || !supabase) {
      mockLogs.push(logEntry);
      
      // Create fulfillment order tracking record
      const orderId = crypto.randomUUID();
      const newOrder: FulfillmentOrder = {
        id: orderId,
        lead_id: id,
        lead_name: leadName,
        sku: item_sku,
        item_name: item_name || item_sku,
        quantity: parseInt(quantity) || 1,
        source_warehouse: partner_country,
        destination_country: 'PH', // Default simulated destination country
        status: 'pending_dispatch',
        updated_at: new Date().toISOString()
      };
      mockFulfillmentOrders.push(newOrder);
      save();
    } else {
      await supabase.from('pipeline_logs').insert([logEntry]);
    }

    return res.status(200).json({
      success: true,
      message: `Supply request submitted. partner notified.`,
      log: logEntry
    });
  } catch (error: any) {
    console.error('[Leads/SupplyRequest] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET: Fetch all fulfillment tracking orders
router.get('/fulfillment/list', (req: Request, res: Response) => {
  return res.status(200).json({ success: true, orders: mockFulfillmentOrders });
});

// PATCH: Update fulfillment order status and trigger notifications
router.patch('/fulfillment/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, carrier, tracking_number, estimated_delivery } = req.body;

    const validStatuses = ['pending_dispatch', 'in_transit', 'arrived', 'installed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid shipment status' });
    }

    const order = mockFulfillmentOrders.find(o => o.id === orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Fulfillment order not found' });
    }

    order.status = status;
    order.updated_at = new Date().toISOString();

    if (carrier !== undefined) order.carrier = carrier;
    if (tracking_number !== undefined) order.tracking_number = tracking_number;
    if (estimated_delivery !== undefined) order.estimated_delivery = estimated_delivery;

    let eventMsg = '';
    let logType = 'sms_sent';
    
    if (status === 'in_transit') {
      eventMsg = `[Fulfillment Alert] SMS sent to customer: Your solar component ${order.item_name} has been shipped from partner warehouse. Tracking ID: APX-TRK-${order.id.slice(0, 8).toUpperCase()}.`;
    } else if (status === 'arrived') {
      eventMsg = `[Fulfillment Alert] SMS sent to local installer: Hardware package for ${order.lead_name} has arrived at the PH hub. Ready for surveyor dispatch.`;
    } else if (status === 'installed') {
      eventMsg = `[Fulfillment Alert] EMAIL sent to customer: Installation completed. Solar system successfully commissioned for ${order.lead_name}.`;
      logType = 'email_sent';
    }

    if (eventMsg) {
      const logEntry = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: order.lead_id,
        event_type: logType,
        payload: {
          to: 'System Alert',
          message: eventMsg,
          type: 'supply_chain_alert',
          order_id: orderId,
          sku: order.sku,
          new_status: status
        }
      };
      mockLogs.push(logEntry);
    }

    save();
    return res.status(200).json({ success: true, order });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Simulate customer reply SMS/Email to automate CRM pipeline updates
router.post('/:id/simulate-reply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message, type } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message content required' });
    }

    const lead = mockLeads.find(l => l.id === id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const logId = crypto.randomUUID();
    const logEntry = {
      id: logId,
      created_at: new Date().toISOString(),
      lead_id: id,
      event_type: type === 'email' ? 'email_received' : 'sms_received',
      payload: {
        from: lead.phone || lead.email,
        message: `[Incoming ${type === 'email' ? 'Email' : 'SMS'}] Client: "${message}"`
      }
    };
    mockLogs.push(logEntry);

    const text = message.toLowerCase().trim();
    let newStage = lead.pipeline_stage;
    let autoReply = '';

    if (text.includes('stop') || text.includes('cancel') || text.includes('opt out')) {
      newStage = 'lost';
      autoReply = 'SMS sent: Understood. You have been opted out of further communications.';
    } else if (text.includes('yes') || text.includes('schedule') || text.includes('confirm') || text.includes('book')) {
      if (lead.pipeline_stage === 'new' || lead.pipeline_stage === 'contacted') {
        newStage = 'estimate_scheduled';
        autoReply = 'SMS sent: Thank you! We have confirmed your solar surveyor slot. See you soon!';
      }
    } else if (text.includes('buy') || text.includes('approve') || text.includes('sign') || text.includes('accept')) {
      newStage = 'won';
      autoReply = 'EMAIL sent: Proposal approved! Your order is placed. Equipment matching is currently in progress.';
    }

    if (newStage !== lead.pipeline_stage) {
      const oldStage = lead.pipeline_stage;
      lead.pipeline_stage = newStage;
      lead.updated_at = new Date().toISOString();

      mockLogs.push({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: id,
        event_type: 'stage_changed',
        payload: {
          from_stage: oldStage,
          to_stage: newStage,
          message: `Stage transitioned from ${oldStage.replace('_', ' ')} to ${newStage.replace('_', ' ')} via inbound client messaging automation.`
        }
      });

      if (autoReply) {
        mockLogs.push({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          lead_id: id,
          event_type: autoReply.startsWith('EMAIL') ? 'email_sent' : 'sms_sent',
          payload: {
            to: lead.phone || lead.email,
            message: autoReply
          }
        });
      }
    }

    save();
    return res.status(200).json({
      success: true,
      lead,
      log: logEntry,
      stageUpdated: newStage !== lead.pipeline_stage
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
