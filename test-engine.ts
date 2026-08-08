import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';

async function runTests() {
  console.log('=== STARTING LEAD-TO-SALE BACKEND ENGINE TEST SUITE ===');

  // Configure testing port and enable mock mode
  const TEST_PORT = '3002';
  process.env.PORT = TEST_PORT;
  process.env.MOCK_DB = 'true';
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${TEST_PORT}/api/v1/leads/mock-n8n-receiver`;

  console.log(`[Test Setup] Starting Express server on port ${TEST_PORT}...`);
  
  // Spawn Express server using compiled JavaScript with shell enabled
  const serverProcess: ChildProcess = spawn('node', ['dist/src/server.js'], {
    env: { ...process.env },
    stdio: 'pipe',
    shell: true
  });

  // Pipe stdout and stderr to view logs in real time
  serverProcess.stdout?.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`[Server Out] ${output}`);
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    const error = data.toString().trim();
    if (error) {
      console.error(`[Server Err] ${error}`);
    }
  });

  // Wait 6 seconds for server boot-up
  await new Promise((resolve) => setTimeout(resolve, 6000));

  const testPayloads = [
    {
      name: 'Valid US Lead with raw phone formatting "(555) 019-9234"',
      payload: {
        full_name: 'John Doe',
        phone: '(555) 019-9234',
        email: 'john.doe@example.com',
        service_type: 'solar',
        monthly_bill: 180.50,
        metadata: { source: 'facebook_ad_campaign' }
      },
      expectedStatus: 201,
      shouldSucceed: true
    },
    {
      name: 'Valid US Lead with international format "+1 555-019-9876"',
      payload: {
        full_name: 'Jane Smith',
        phone: '+1 555-019-9876',
        email: 'jane.smith@example.com',
        service_type: 'hvac_repair',
        monthly_bill: 85.00,
        metadata: { campaign_id: 'summer_promo_2026' }
      },
      expectedStatus: 201,
      shouldSucceed: true
    },
    {
      name: 'Invalid Lead (missing phone number)',
      payload: {
        full_name: 'Missing Phone Person',
        email: 'nophone@example.com'
      },
      expectedStatus: 400,
      shouldSucceed: false
    },
    {
      name: 'Invalid Lead (negative monthly bill)',
      payload: {
        full_name: 'Bad Bill Person',
        phone: '555-019-1111',
        monthly_bill: -50
      },
      expectedStatus: 400,
      shouldSucceed: false
    }
  ];

  let passedTests = 0;

  for (const t of testPayloads) {
    console.log(`\n--- Running Case: ${t.name} ---`);
    try {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/leads/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t.payload)
      });

      const body: any = await res.json();
      console.log(`Response Status: ${res.status}`);
      console.log('Response Body:', JSON.stringify(body, null, 2));

      if (res.status === t.expectedStatus) {
        console.log(`[Check] Status matches expected (${t.expectedStatus})`);
        if (t.shouldSucceed) {
          if (body.success && body.lead_id) {
            console.log(`[Check] lead_id generated ("${body.lead_id}")`);
            passedTests++;
          } else {
            console.log('❌ Failure: missing lead_id or success flag in response');
          }
        } else {
          passedTests++;
        }
      } else {
        console.log(`❌ Failure: Status was ${res.status}, expected ${t.expectedStatus}`);
      }
    } catch (err: any) {
      console.error('❌ Failure: Request threw exception', err.message);
    }
  }

  // Verify DB state and Stage Transitions
  console.log('\n--- Verifying Database State, Normalization & Stage Transitions ---');
  try {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/leads/leads`);
    const body: any = await res.json();

    if (body.leads && body.leads.length === 2) {
      console.log('✅ In-memory database has exactly 2 valid leads.');
      
      const jdLead = body.leads.find((l: any) => l.full_name === 'John Doe');
      const jsLead = body.leads.find((l: any) => l.full_name === 'Jane Smith');
      
      if (jdLead && jdLead.phone === '+15550199234') {
        console.log('✅ Phone normalization success: John Doe -> +15550199234');
        passedTests++;
      } else {
        console.log(`❌ Normalization mismatch: John Doe phone is ${jdLead?.phone}`);
      }

      if (jsLead && jsLead.phone === '+15550199876') {
        console.log('✅ Phone normalization success: Jane Smith -> +15550199876');
        passedTests++;
      } else {
        console.log(`❌ Normalization mismatch: Jane Smith phone is ${jsLead?.phone}`);
      }

      const createdLogs = body.logs.filter((l: any) => l.event_type === 'lead_created');
      const initialSmsLogs = body.logs.filter((l: any) => l.event_type === 'sms_sent');
      
      if (body.logs && body.logs.length === 6 && createdLogs.length === 2 && initialSmsLogs.length === 4) {
        console.log('✅ Pipeline audit logging verified: 2 "lead_created" and 4 "sms_sent" events written.');
        passedTests++;
      } else {
        console.log('❌ Audit logs check failed. Found:', body.logs.length);
      }

      // 1. Perform a valid PATCH stage update test on John Doe (Move to 'contacted')
      if (jdLead) {
        console.log('\n--- Testing Stage Transition: new -> contacted (PATCH /:id/stage) ---');
        const transitionRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/leads/${jdLead.id}/stage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipeline_stage: 'contacted' })
        });
        const transitionBody: any = await transitionRes.json();
        console.log(`Response Status: ${transitionRes.status}`);
        
        if (transitionRes.status === 200 && transitionBody.success && transitionBody.lead.pipeline_stage === 'contacted') {
          console.log('✅ Stage updated successfully to "contacted"');
          passedTests++;
        } else {
          console.log('❌ Failed: Stage transition rejected', transitionBody);
        }

        // 2. Perform another stage transition to 'estimate_scheduled' (should trigger SMS automation)
        console.log('\n--- Testing Stage Transition: contacted -> estimate_scheduled (Triggers SMS Automation) ---');
        const schedRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/leads/${jdLead.id}/stage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipeline_stage: 'estimate_scheduled' })
        });
        const schedBody: any = await schedRes.json();
        console.log(`Response Status: ${schedRes.status}`);
        
        if (schedRes.status === 200 && schedBody.success && schedBody.lead.pipeline_stage === 'estimate_scheduled') {
          console.log('✅ Stage updated successfully to "estimate_scheduled"');
          passedTests++;
        } else {
          console.log('❌ Failed: Stage transition rejected', schedBody);
        }

        // 3. Perform an invalid PATCH stage update test
        console.log('\n--- Testing Invalid Stage Transition (PATCH /:id/stage) ---');
        const invalidTransitionRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/leads/${jdLead.id}/stage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipeline_stage: 'not_a_real_stage' })
        });
        console.log(`Response Status: ${invalidTransitionRes.status}`);
        
        if (invalidTransitionRes.status === 400) {
          console.log('✅ Rejected invalid stage name correctly (Status 400)');
          passedTests++;
        } else {
          console.log(`❌ Failed: Expected 400 response, got ${invalidTransitionRes.status}`);
        }

        // 4. Re-verify Database log updates
        console.log('\n--- Re-verifying Database State and Audit Log Append ---');
        const finalRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/leads/leads`);
        const finalBody: any = await finalRes.json();
        const updatedJdLead = finalBody.leads.find((l: any) => l.id === jdLead.id);
        
        if (updatedJdLead && updatedJdLead.pipeline_stage === 'estimate_scheduled') {
          console.log('✅ Persistent Stage change verified in database ("estimate_scheduled").');
          passedTests++;
        } else {
          console.log(`❌ Stage change not persistent: stage is ${updatedJdLead?.pipeline_stage}`);
        }

        const finalLogs = finalBody.logs;
        const stageUpdatedLogs = finalLogs.filter((l: any) => l.event_type === 'stage_updated');
        const totalSmsLogs = finalLogs.filter((l: any) => l.event_type === 'sms_sent');
        
        if (finalLogs.length === 9 && stageUpdatedLogs.length === 2 && totalSmsLogs.length === 5) {
          console.log('✅ Stage update and SMS sent log appends verified.');
          passedTests++;
        } else {
          console.log(`❌ Log audit verification mismatch. Total: ${finalLogs.length}, Stage updates: ${stageUpdatedLogs.length}, SMS sent: ${totalSmsLogs.length}`);
          console.log(finalLogs);
        }

        // 5. Verify simulated SMS outbox endpoint polling
        console.log('\n--- Testing Simulated SMS Outbox Polling Endpoint ---');
        const smsRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/leads/simulated-sms?since=0`);
        const smsBody: any = await smsRes.json();
        
        // Expected SMS in outbox: 4 initial (2 cust + 2 disp) + 1 stage update = 5 total simulated SMS
        if (smsBody.sms && smsBody.sms.length === 5) {
          console.log('✅ Outbox simulator has exactly 5 sent SMS messages.');
          passedTests++;
          
          const stageSms = smsBody.sms.find((s: any) => s.type === 'stage_automation');
          if (stageSms && stageSms.message.includes('appointment is confirmed')) {
            console.log('✅ Outbound stage confirmation SMS content verified.');
            passedTests++;
          } else {
            console.log('❌ Stage SMS content mismatch:', stageSms);
          }
        } else {
          console.log(`❌ SMS outbox count mismatch. Expected 5, found ${smsBody.sms?.length}`);
          console.log(smsBody.sms);
        }
      }
    } else {
      console.log(`❌ Incorrect lead count. Expected 2, found ${body.leads?.length}`);
    }
  } catch (err: any) {
    console.error('❌ Verification request failed', err.message);
  }

  // Teardown
  console.log('\n[Test Teardown] Terminating Express server...');
  // Clean up the server process tree
  if (process.platform === 'win32' && serverProcess.pid) {
    try {
      execSync(`taskkill /pid ${serverProcess.pid} /f /t`, { stdio: 'ignore' });
    } catch (e) {
      // Ignore if already killed
    }
  } else {
    serverProcess.kill();
  }

  console.log(`\n=== TEST SUITE COMPLETED: ${passedTests}/${testPayloads.length + 10} checks passed. ===`);
  if (passedTests === testPayloads.length + 10) {
    console.log('All backend and frontend API engine systems verified successfully.');
    process.exit(0);
  } else {
    console.error('Some validation checks failed.');
    process.exit(1);
  }
}

runTests();
