import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import leadsRouter from './routes/leads';
import inventoryRouter from './routes/inventory';

import { sanitizeBody } from './middleware/security';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(sanitizeBody);

// Main Ingestion Router mount
app.use('/api/v1/leads', leadsRouter);
app.use('/api/v1/inventory', inventoryRouter);

// Serve static frontend files from 'public' directory
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Server] Lead-to-Sale backend engine running on port ${PORT}`);
});
