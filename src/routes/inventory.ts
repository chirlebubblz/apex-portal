import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireToken } from '../middleware/security';

const router = Router();

// Config Supabase if present
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const isMockMode = process.env.MOCK_DB === 'true' || !supabaseUrl || !supabaseKey;

const supabase = isMockMode ? null : createClient(supabaseUrl!, supabaseKey!);

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  unit_cost: number;
  currency: string;
  specs: string;
  warehouse_country: string; // PH, CN, etc.
  created_at: string;
}

import { getDb, saveDb } from './db';

// GET: List all inventory items
router.get('/', async (req: Request, res: Response) => {
  try {
    if (isMockMode || !supabase) {
      return res.status(200).json({ success: true, inventory: getDb().inventory });
    }

    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json({ success: true, inventory: data });
  } catch (error: any) {
    console.error('[Inventory] List retrieval error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Add new inventory item
router.post('/', requireToken, async (req: Request, res: Response) => {
  try {
    const { name, sku, category, quantity, unit_cost, currency, specs, warehouse_country } = req.body;

    if (!name || !sku || !category || quantity === undefined || !unit_cost) {
      return res.status(400).json({ success: false, error: 'Missing required inventory fields' });
    }

    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      name,
      sku: sku.toUpperCase().trim(),
      category,
      quantity: parseInt(quantity) || 0,
      unit_cost: parseFloat(unit_cost) || 0,
      currency: currency || 'PHP',
      specs: specs || '',
      warehouse_country: warehouse_country || 'PH',
      created_at: new Date().toISOString()
    };

    if (isMockMode || !supabase) {
      const db = getDb();
      db.inventory.unshift(newItem);
      saveDb(db.leads, db.logs, db.sms, db.fulfillment, db.inventory);
      return res.status(201).json({ success: true, item: newItem });
    }

    const { data, error } = await supabase
      .from('inventory')
      .insert([newItem])
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, item: data });
  } catch (error: any) {
    console.error('[Inventory] Creation error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH: Update general details, quantity or unit cost of an item
router.patch('/:id', requireToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, sku, category, quantity, unit_cost, currency, specs, warehouse_country } = req.body;

    if (isMockMode || !supabase) {
      const db = getDb();
      const idx = db.inventory.findIndex(item => item.id === id);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Inventory item not found' });
      }

      if (name !== undefined) db.inventory[idx].name = name;
      if (sku !== undefined) db.inventory[idx].sku = sku.toUpperCase().trim();
      if (category !== undefined) db.inventory[idx].category = category;
      if (quantity !== undefined) db.inventory[idx].quantity = parseInt(quantity);
      if (unit_cost !== undefined) db.inventory[idx].unit_cost = parseFloat(unit_cost);
      if (currency !== undefined) db.inventory[idx].currency = currency;
      if (specs !== undefined) db.inventory[idx].specs = specs;
      if (warehouse_country !== undefined) db.inventory[idx].warehouse_country = warehouse_country;

      saveDb(db.leads, db.logs, db.sms, db.fulfillment, db.inventory);
      return res.status(200).json({ success: true, item: db.inventory[idx] });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (sku !== undefined) updates.sku = sku.toUpperCase().trim();
    if (category !== undefined) updates.category = category;
    if (quantity !== undefined) updates.quantity = parseInt(quantity);
    if (unit_cost !== undefined) updates.unit_cost = parseFloat(unit_cost);
    if (currency !== undefined) updates.currency = currency;
    if (specs !== undefined) updates.specs = specs;
    if (warehouse_country !== undefined) updates.warehouse_country = warehouse_country;

    const { data, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.status(200).json({ success: true, item: data });
  } catch (error: any) {
    console.error('[Inventory] Update error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE: Delete an inventory item
router.delete('/:id', requireToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isMockMode || !supabase) {
      const db = getDb();
      const idx = db.inventory.findIndex(item => item.id === id);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Inventory item not found' });
      }
      db.inventory.splice(idx, 1);
      saveDb(db.leads, db.logs, db.sms, db.fulfillment, db.inventory);
      return res.status(200).json({ success: true });
    }

    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[Inventory] Deletion error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export function adjustMockStock(sku: string, qtyChange: number) {
  const db = getDb();
  const item = db.inventory.find(i => i.sku === sku);
  if (item) {
    item.quantity = Math.max(0, item.quantity + qtyChange);
    saveDb(db.leads, db.logs, db.sms, db.fulfillment, db.inventory);
    return true;
  }
  return false;
}

export default router;
