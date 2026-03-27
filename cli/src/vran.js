#!/usr/bin/env node

'use strict';

const { program } = require('commander');
const chalk       = require('chalk');
const ora         = require('ora');
const axios       = require('axios');

const VERSION  = '1.0.0';
const BASE_URL = process.env.VETRAN_API || 'http://localhost:3000';

// ─── Theme ────────────────────────────────────────────────────────────────────
const g   = chalk.hex('#00FF7F');        // green
const g2  = chalk.hex('#009944');        // dim green
const g3  = chalk.hex('#004422');        // very dim green
const am  = chalk.hex('#FFB800');        // amber
const red = chalk.hex('#FF2233');        // red
const cy  = chalk.hex('#00EEFF');        // cyan
const wh  = chalk.hex('#D0FFE8');        // white-green
const dim = chalk.hex('#1E4A2A');        // dark dim
const mid = chalk.hex('#4A8A60');        // mid green

// ─── Helpers ──────────────────────────────────────────────────────────────────
function line(char = '─', len = 58) {
  return g2(char.repeat(len));
}

function label(text, pad = 22) {
  return mid(text.padEnd(pad));
}

function printHeader() {
  console.log('');
  console.log(g('  ██╗   ██╗███████╗████████╗██████╗  █████╗ ███╗   ██╗'));
  console.log(g('  ██║   ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║'));
  console.log(g('  ██║   ██║█████╗     ██║   ██████╔╝███████║██╔██╗ ██║'));
  console.log(g('  ╚██╗ ██╔╝██╔══╝     ██║   ██╔══██╗██╔══██║██║╚██╗██║'));
  console.log(g('   ╚████╔╝ ███████╗   ██║   ██║  ██║██║  ██║██║ ╚████║'));
  console.log(g('    ╚═══╝  ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝'));
  console.log('');
  console.log(`  ${g2('TRUST INFRASTRUCTURE FOR AI AGENTS')}   ${dim('v' + VERSION)}`);
  console.log('');
}

function printBox(lines) {
  const width = 58;
  console.log(g2('┌' + '─'.repeat(width) + '┐'));
  for (const l of lines) {
    const stripped = l.replace(/\u001b\[[0-9;]*m/g, '');
    const pad = Math.max(0, width - stripped.length - 2);
    console.log(g2('│') + ' ' + l + ' '.repeat(pad) + ' ' + g2('│'));
  }
  console.log(g2('└' + '─'.repeat(width) + '┘'));
}

function badgeColor(badge) {
  if (badge === 'ELITE')  return chalk.yellow('★ ELITE');
  if (badge === 'ACTIVE') return g('● ACTIVE');
  return mid('○ ROOKIE');
}

function statusColor(status) {
  if (status === 'ACTIVE')  return g('ACTIVE');
  if (status === 'REVOKED') return red('REVOKED');
  return am(status);
}

function clearanceBlock(cleared) {
  if (cleared) {
    console.log('');
    console.log(g('  ╔══════════════════════════════════════════════════════╗'));
    console.log(g('  ║                                                      ║'));
    console.log(g('  ║            ✓  CLEARED TO EXECUTE                     ║'));
    console.log(g('  ║                                                      ║'));
    console.log(g('  ╚══════════════════════════════════════════════════════╝'));
  } else {
    console.log('');
    console.log(red('  ╔══════════════════════════════════════════════════════╗'));
    console.log(red('  ║                                                      ║'));
    console.log(red('  ║            ✗  NOT CLEARED — EXECUTION BLOCKED        ║'));
    console.log(red('  ║                                                      ║'));
    console.log(red('  ╚══════════════════════════════════════════════════════╝'));
  }
  console.log('');
}

function api() {
  return axios.create({ baseURL: BASE_URL, timeout: 8000 });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

// VERIFY
async function cmdVerify(agentId, opts) {
  printHeader();

  const spinner = ora({
    text: mid('  Contacting Vetran registry...'),
    spinner: 'dots',
    color: 'green'
  }).start();

  try {
    // First get status to find the agent
    const statusRes = await api().get(`/status/${agentId}`);
    const agent = statusRes.data;

    spinner.succeed(g('  Registry contact established'));

    await new Promise(r => setTimeout(r, 300));

    console.log('');
    console.log(line());
    console.log(g2('  AGENT IDENTITY VERIFICATION') + '  ' + dim(new Date().toISOString()));
    console.log(line());
    console.log('');
    console.log(`  ${label('AGENT ID')}${cy(agent.agentId)}`);
    console.log(`  ${label('NAME')}${wh(agent.name)}`);
    console.log(`  ${label('OWNER')}${wh(agent.owner)}`);
    console.log(`  ${label('STATUS')}${statusColor(agent.status)}`);
    console.log(`  ${label('BADGE')}${badgeColor(agent.badge)}`);
    console.log(`  ${label('VETRAN SCORE')}${g(String(agent.vetranScore))}`);
    console.log(`  ${label('VERIFICATIONS')}${mid(String(agent.verificationCount))}`);
    console.log(`  ${label('DELEGATIONS')}${mid(String(agent.delegationCount))}`);
    console.log(`  ${label('REGISTERED')}${mid(agent.registeredAt)}`);

    if (agent.lastVerifiedAt) {
      console.log(`  ${label('LAST VERIFIED')}${mid(agent.lastVerifiedAt)}`);
    }

    if (agent.capabilities && agent.capabilities.length > 0) {
      console.log('');
      console.log(`  ${g2('CAPABILITIES')}`);
      for (const cap of agent.capabilities) {
        console.log(`    ${g('▸')} ${mid(cap)}`);
      }
    }

    console.log('');
    console.log(line());

    if (agent.status === 'REVOKED') {
      clearanceBlock(false);
      console.log(red(`  ✗ This agent has been revoked and cannot execute.`));
      console.log('');
      process.exit(1);
    } else {
      clearanceBlock(true);
      console.log(g(`  ✓ Agent is Vetran-verified and cleared to execute.`));
      console.log('');
    }

  } catch (err) {
    spinner.fail(red('  Registry unreachable or agent not found'));
    if (err.response?.status === 404) {
      console.log('');
      console.log(red(`  ✗ AGENT NOT FOUND: ${agentId}`));
      console.log(mid('    Make sure this agent is registered with Vetran.'));
    } else {
      console.log('');
      console.log(red(`  ✗ ERROR: ${err.message}`));
      console.log(mid(`    Is the Vetran API running at ${BASE_URL}?`));
    }
    console.log('');
    process.exit(1);
  }
}

// REGISTER
async function cmdRegister(opts) {
  printHeader();

  if (!opts.name || !opts.owner) {
    console.log(red('  ✗ ERROR: --name and --owner are required'));
    console.log('');
    console.log(mid('  Example:'));
    console.log(g('  vran register --name "MyAgent" --owner "acme-corp" --caps read:email,write:calendar'));
    console.log('');
    process.exit(1);
  }

  const capabilities = opts.caps ? opts.caps.split(',').map(s => s.trim()) : [];

  const spinner = ora({
    text: mid('  Registering agent with Vetran...'),
    spinner: 'dots',
    color: 'green'
  }).start();

  try {
    const res = await api().post('/register', {
      name: opts.name,
      owner: opts.owner,
      model: opts.model || 'unspecified',
      description: opts.description || '',
      capabilities
    });

    const { agentId, token, agent } = res.data;

    spinner.succeed(g('  Agent registered successfully'));

    await new Promise(r => setTimeout(r, 300));

    console.log('');
    console.log(line());
    console.log(g2('  AGENT REGISTRATION COMPLETE') + '  ' + dim(new Date().toISOString()));
    console.log(line());
    console.log('');
    console.log(`  ${label('AGENT ID')}${cy(agentId)}`);
    console.log(`  ${label('NAME')}${wh(agent.name)}`);
    console.log(`  ${label('OWNER')}${wh(agent.owner)}`);
    console.log(`  ${label('STATUS')}${g('ACTIVE')}`);
    console.log(`  ${label('BADGE')}${badgeColor(agent.badge)}`);
    console.log(`  ${label('REGISTERED')}${mid(agent.registeredAt)}`);

    if (capabilities.length > 0) {
      console.log('');
      console.log(`  ${g2('CAPABILITIES')}`);
      for (const cap of capabilities) {
        console.log(`    ${g('▸')} ${mid(cap)}`);
      }
    }

    console.log('');
    console.log(line());
    console.log('');
    console.log(g2('  IDENTITY TOKEN (store securely):'));
    console.log('');

    // Print token in chunks for readability
    const tokenChunks = token.match(/.{1,64}/g) || [];
    for (const chunk of tokenChunks) {
      console.log(`  ${g3(chunk)}`);
    }

    console.log('');
    console.log(line());
    console.log('');
    console.log(g(`  ✓ Agent "${agent.name}" is now Vetran-registered.`));
    console.log(mid(`    Save your token — it's your agent's identity.`));
    console.log('');

  } catch (err) {
    spinner.fail(red('  Registration failed'));
    console.log('');
    console.log(red(`  ✗ ERROR: ${err.response?.data?.message || err.message}`));
    console.log('');
    process.exit(1);
  }
}

// REVOKE
async function cmdRevoke(agentId, opts) {
  printHeader();

  const spinner = ora({
    text: am('  Initiating revocation sequence...'),
    spinner: 'dots',
    color: 'yellow'
  }).start();

  await new Promise(r => setTimeout(r, 600));

  try {
    const res = await api().post(`/revoke/${agentId}`, {
      reason: opts.reason || 'Revoked via vran CLI'
    });

    const data = res.data;

    spinner.succeed(red('  Revocation complete'));

    await new Promise(r => setTimeout(r, 300));

    console.log('');
    console.log(red('  ╔══════════════════════════════════════════════════════╗'));
    console.log(red('  ║                                                      ║'));
    console.log(red('  ║            ✗  AGENT REVOKED                          ║'));
    console.log(red('  ║                                                      ║'));
    console.log(red('  ╚══════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(line());
    console.log(g2('  REVOCATION RECORD') + '  ' + dim(new Date().toISOString()));
    console.log(line());
    console.log('');
    console.log(`  ${label('AGENT ID')}${cy(data.agentId)}`);
    console.log(`  ${label('STATUS')}${red('REVOKED')}`);
    console.log(`  ${label('REVOKED AT')}${mid(data.revokedAt)}`);
    console.log(`  ${label('REASON')}${am(data.reason)}`);
    console.log('');
    console.log(line());
    console.log('');
    console.log(red(`  ✗ Agent is blacklisted. All future verify calls will be denied.`));
    console.log(mid(`    This action is permanent and cannot be undone.`));
    console.log('');

  } catch (err) {
    spinner.fail(red('  Revocation failed'));
    console.log('');
    if (err.response?.status === 404) {
      console.log(red(`  ✗ AGENT NOT FOUND: ${agentId}`));
    } else {
      console.log(red(`  ✗ ERROR: ${err.response?.data?.message || err.message}`));
    }
    console.log('');
    process.exit(1);
  }
}

// STATUS
async function cmdStatus(agentId) {
  printHeader();

  const spinner = ora({
    text: mid('  Fetching agent status...'),
    spinner: 'dots',
    color: 'green'
  }).start();

  try {
    const res = await api().get(`/status/${agentId}`);
    const agent = res.data;

    spinner.succeed(g('  Status retrieved'));
    await new Promise(r => setTimeout(r, 200));

    console.log('');
    console.log(line());
    console.log(g2('  AGENT STATUS REPORT') + '  ' + dim(new Date().toISOString()));
    console.log(line());
    console.log('');
    console.log(`  ${label('AGENT ID')}${cy(agent.agentId)}`);
    console.log(`  ${label('NAME')}${wh(agent.name)}`);
    console.log(`  ${label('OWNER')}${wh(agent.owner)}`);
    console.log(`  ${label('STATUS')}${statusColor(agent.status)}`);
    console.log(`  ${label('BADGE')}${badgeColor(agent.badge)}`);
    console.log(`  ${label('VETRAN SCORE')}${g(String(agent.vetranScore))}`);
    console.log(`  ${label('VERIFICATIONS')}${mid(String(agent.verificationCount))}`);
    console.log(`  ${label('DELEGATIONS')}${mid(String(agent.delegationCount))}`);
    console.log(`  ${label('REGISTERED')}${mid(agent.registeredAt)}`);

    if (agent.lastVerifiedAt) {
      console.log(`  ${label('LAST VERIFIED')}${mid(agent.lastVerifiedAt)}`);
    }

    if (agent.capabilities?.length > 0) {
      console.log('');
      console.log(`  ${g2('CAPABILITIES')}`);
      for (const cap of agent.capabilities) {
        console.log(`    ${g('▸')} ${mid(cap)}`);
      }
    }

    console.log('');
    console.log(line());
    console.log('');

  } catch (err) {
    spinner.fail(red('  Failed to retrieve status'));
    if (err.response?.status === 404) {
      console.log('');
      console.log(red(`  ✗ AGENT NOT FOUND: ${agentId}`));
    } else {
      console.log('');
      console.log(red(`  ✗ ERROR: ${err.message}`));
    }
    console.log('');
    process.exit(1);
  }
}

// PING
async function cmdPing() {
  printHeader();
  const spinner = ora({
    text: mid('  Pinging Vetran registry...'),
    spinner: 'dots',
    color: 'green'
  }).start();

  try {
    const start = Date.now();
    const res = await api().get('/');
    const ms = Date.now() - start;

    spinner.succeed(g('  Registry is operational'));
    console.log('');
    printBox([
      `${g2('SERVICE')}   ${wh(res.data.service)}`,
      `${g2('VERSION')}   ${wh(res.data.version)}`,
      `${g2('STATUS')}    ${g(res.data.status.toUpperCase())}`,
      `${g2('LATENCY')}   ${g(ms + 'ms')}`,
      `${g2('ENDPOINT')}  ${mid(BASE_URL)}`,
    ]);
    console.log('');
    console.log(g(`  ✓ Vetran is online and ready.`));
    console.log('');
  } catch (err) {
    spinner.fail(red('  Registry unreachable'));
    console.log('');
    console.log(red(`  ✗ Cannot reach Vetran at ${BASE_URL}`));
    console.log(mid(`    Start the server: node src/index.js`));
    console.log('');
    process.exit(1);
  }
}

// ─── CLI Definition ───────────────────────────────────────────────────────────
program
  .name('vran')
  .description(g('Vetran CLI — Trust infrastructure for AI agents'))
  .version(VERSION);

program
  .command('verify <agentId>')
  .description('Verify an agent identity and check clearance status')
  .action(cmdVerify);

program
  .command('register')
  .description('Register a new agent with the Vetran registry')
  .option('-n, --name <name>',        'Agent name (required)')
  .option('-o, --owner <owner>',      'Owner org (required)')
  .option('-c, --caps <caps>',        'Comma-separated capabilities (e.g. read:email,write:calendar)')
  .option('-m, --model <model>',      'AI model name')
  .option('-d, --description <desc>', 'Agent description')
  .action(cmdRegister);

program
  .command('revoke <agentId>')
  .description('Immediately revoke an agent — blocks all future verifications')
  .option('-r, --reason <reason>', 'Reason for revocation')
  .action(cmdRevoke);

program
  .command('status <agentId>')
  .description('Get current standing of an agent in the Vetran registry')
  .action(cmdStatus);

program
  .command('ping')
  .description('Check if the Vetran registry is online')
  .action(cmdPing);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  printHeader();
  program.outputHelp();
}
