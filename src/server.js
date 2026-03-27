'use strict';

require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const jwt       = require('jsonwebtoken');
const db        = require('./db');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '16kb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'vetran-dev-secret-change-in-prod';
const PORT       = process.env.PORT || 3000;

// ── Rate Limiting ──────────────────────────────────────────────────────────────
const globalLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests.' },
});

const verifyLimit = rateLimit({
  windowMs: 60 * 1000, max: 60,
  message: { error: 'RATE_LIMITED', message: 'Verify rate limit: 60/min.' },
});

const registerLimit = rateLimit({
  windowMs: 60 * 1000, max: 10,
  message: { error: 'RATE_LIMITED', message: 'Register rate limit: 10/min.' },
});

app.use(globalLimit);

// ── Validation ─────────────────────────────────────────────────────────────────
const VALID_EXPIRES = ['1h','2h','4h','8h','12h','24h','48h','7d','30d'];

function validateStr(val, max = 100) {
  return typeof val === 'string' && val.trim().length >= 1 && val.trim().length <= max;
}

function validateCapabilities(caps) {
  if (!caps) return true;
  if (!Array.isArray(caps) || caps.length > 50) return false;
  return caps.every(c => typeof c === 'string' && c.length <= 64 && /^[\w:.*-]+$/.test(c));
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const timestamp  = () => new Date().toISOString();
const vetranBadge = n => n > 100 ? 'ELITE' : n > 10 ? 'ACTIVE' : 'ROOKIE';

function agentPublic(agent, delegationCount = 0) {
  return {
    agentId: agent.agentId, name: agent.name, owner: agent.owner,
    model: agent.model, capabilities: agent.capabilities,
    status: agent.status, badge: agent.badge, vetranScore: agent.vetranScore,
    verificationCount: agent.verificationCount, registeredAt: agent.registeredAt,
    lastVerifiedAt: agent.lastVerifiedAt, delegationCount,
  };
}

// ── GET / ──────────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  let dbStatus = 'connected';
  try { await db.ping(); } catch { dbStatus = 'disconnected'; }
  res.json({
    service: 'Vetran', tagline: 'Trust infrastructure for AI agents',
    version: '1.0.0', status: 'operational', database: dbStatus,
    endpoints: ['/register', '/verify', '/delegate', '/status/:agentId', '/revoke/:agentId'],
  });
});

// ── POST /register ─────────────────────────────────────────────────────────────
app.post('/register', registerLimit, async (req, res) => {
  const { name, owner, capabilities, model, description } = req.body;

  if (!validateStr(name))
    return res.status(400).json({ error: 'INVALID_NAME', message: 'name must be 1-100 characters' });
  if (!validateStr(owner))
    return res.status(400).json({ error: 'INVALID_OWNER', message: 'owner must be 1-100 characters' });
  if (!validateCapabilities(capabilities))
    return res.status(400).json({ error: 'INVALID_CAPABILITIES', message: 'capabilities must be an array of up to 50 strings e.g. ["read:calendar"]' });

  const agentId = `agt_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

  try {
    const agent = await db.createAgent({
      agentId, name: name.trim(), owner: owner.trim(),
      model: model || 'unspecified', description: description || '',
      capabilities: capabilities || [], status: 'ACTIVE',
      vetranScore: 100, badge: 'ROOKIE',
      registeredAt: timestamp(), verificationCount: 0,
    });

    const token = jwt.sign(
      { agentId, name: name.trim(), owner: owner.trim(), capabilities: capabilities || [] },
      JWT_SECRET, { expiresIn: '30d' }
    );

    console.log(`[VETRAN] Registered: ${agentId} (${name}) by ${owner}`);
    res.status(201).json({
      success: true, message: `Agent "${name}" is now Vetran-registered`,
      agentId, token, agent: agentPublic(agent),
    });
  } catch (err) {
    console.error('[VETRAN] Register error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── POST /verify ───────────────────────────────────────────────────────────────
app.post('/verify', verifyLimit, async (req, res) => {
  const { token, requestedCapabilities } = req.body;

  if (!token)
    return res.status(400).json({ error: 'MISSING_TOKEN', message: 'token is required' });
  if (requestedCapabilities && !validateCapabilities(requestedCapabilities))
    return res.status(400).json({ error: 'INVALID_CAPABILITIES', message: 'requestedCapabilities must be a valid array' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      verified: false, error: 'INVALID_TOKEN', clearedToExecute: false,
      message: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Token is invalid or tampered',
    });
  }

  try {
    const agent = await db.getAgent(decoded.agentId);

    if (!agent)
      return res.status(404).json({ verified: false, error: 'AGENT_NOT_FOUND', message: 'Agent not found in Vetran registry', clearedToExecute: false });

    if (agent.status === 'REVOKED') {
      await db.logVerification({ agentId: agent.agentId, verified: false, clearedToExecute: false, requestedCaps: requestedCapabilities || [], missingCaps: [], ip: req.ip });
      return res.status(403).json({ verified: false, error: 'AGENT_REVOKED', message: 'This agent has been revoked and is not cleared to execute', clearedToExecute: false, revokedAt: agent.revokedAt });
    }

    let capabilityCheck = { passed: true, missing: [] };
    if (requestedCapabilities?.length > 0) {
      const missing = requestedCapabilities.filter(c => !agent.capabilities.includes(c));
      if (missing.length > 0) capabilityCheck = { passed: false, missing };
    }

    const newBadge    = vetranBadge(agent.verificationCount + 1);
    const updated     = await db.incrementVerification(agent.agentId, newBadge);
    const delegations = await db.getDelegationCount(agent.agentId);

    await db.logVerification({
      agentId: agent.agentId, verified: true,
      clearedToExecute: capabilityCheck.passed,
      requestedCaps: requestedCapabilities || [],
      missingCaps: capabilityCheck.missing, ip: req.ip,
    });

    console.log(`[VETRAN] Verified: ${agent.agentId} — cleared: ${capabilityCheck.passed}`);
    res.json({
      verified: true, clearedToExecute: capabilityCheck.passed,
      agent: agentPublic(updated, delegations),
      capabilityCheck, verifiedAt: timestamp(),
    });
  } catch (err) {
    console.error('[VETRAN] Verify error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── POST /delegate ─────────────────────────────────────────────────────────────
app.post('/delegate', async (req, res) => {
  const { parentToken, childAgentId, scopedCapabilities, expiresIn } = req.body;

  if (!parentToken || !childAgentId)
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'parentToken and childAgentId are required' });

  const ttl = expiresIn || '24h';
  if (!VALID_EXPIRES.includes(ttl))
    return res.status(400).json({ error: 'INVALID_EXPIRES', message: `expiresIn must be one of: ${VALID_EXPIRES.join(', ')}` });

  if (scopedCapabilities && !validateCapabilities(scopedCapabilities))
    return res.status(400).json({ error: 'INVALID_CAPABILITIES', message: 'scopedCapabilities must be a valid array' });

  let parentDecoded;
  try {
    parentDecoded = jwt.verify(parentToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'INVALID_PARENT_TOKEN', message: 'Parent token is invalid or expired' });
  }

  try {
    const parentAgent = await db.getAgent(parentDecoded.agentId);
    const childAgent  = await db.getAgent(childAgentId);

    if (!parentAgent) return res.status(404).json({ error: 'PARENT_NOT_FOUND' });
    if (!childAgent)  return res.status(404).json({ error: 'CHILD_NOT_FOUND', message: 'Child agent not found in registry' });
    if (parentAgent.status === 'REVOKED') return res.status(403).json({ error: 'PARENT_REVOKED', message: 'Revoked agents cannot delegate trust' });

    const allowedCaps  = scopedCapabilities
      ? scopedCapabilities.filter(c => parentAgent.capabilities.includes(c))
      : parentAgent.capabilities;

    const delegationId    = `del_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const chain           = [...(parentDecoded.chain || []), parentAgent.agentId];
    const delegationToken = jwt.sign(
      { delegationId, parentAgentId: parentAgent.agentId, childAgentId, scopedCapabilities: allowedCaps, chain },
      JWT_SECRET, { expiresIn: ttl }
    );

    await db.createDelegation({
      delegationId, parentAgentId: parentAgent.agentId,
      childAgentId, scopedCapabilities: allowedCaps,
      token: delegationToken, expiresIn: ttl,
    });

    console.log(`[VETRAN] Delegation: ${parentAgent.agentId} → ${childAgentId}`);
    res.status(201).json({
      success: true, message: `Trust delegated from "${parentAgent.name}" to "${childAgent.name}"`,
      delegationId, delegationToken,
      chain: [...chain, childAgentId],
      scopedCapabilities: allowedCaps, expiresIn: ttl,
    });
  } catch (err) {
    console.error('[VETRAN] Delegate error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── GET /status/:agentId ───────────────────────────────────────────────────────
app.get('/status/:agentId', async (req, res) => {
  try {
    const agent = await db.getAgent(req.params.agentId);
    if (!agent)
      return res.status(404).json({ error: 'AGENT_NOT_FOUND', message: `No agent found with ID: ${req.params.agentId}` });
    const delegations = await db.getDelegationCount(agent.agentId);
    res.json(agentPublic(agent, delegations));
  } catch (err) {
    console.error('[VETRAN] Status error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── POST /revoke/:agentId ──────────────────────────────────────────────────────
// SECURITY FIX: requires ownerToken — prevents anyone from revoking arbitrary agents
app.post('/revoke/:agentId', async (req, res) => {
  const { reason, ownerToken } = req.body;

  if (!ownerToken)
    return res.status(401).json({ error: 'MISSING_OWNER_TOKEN', message: 'ownerToken is required to revoke an agent' });

  let callerDecoded;
  try {
    callerDecoded = jwt.verify(ownerToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'INVALID_OWNER_TOKEN', message: 'ownerToken is invalid or expired' });
  }

  try {
    const agent = await db.getAgent(req.params.agentId);
    if (!agent) return res.status(404).json({ error: 'AGENT_NOT_FOUND' });

    // Only the agent itself OR another agent with the same owner can revoke
    const isOwn       = callerDecoded.agentId === agent.agentId;
    const isSameOwner = callerDecoded.owner === agent.owner;

    if (!isOwn && !isSameOwner)
      return res.status(403).json({ error: 'UNAUTHORIZED', message: 'You are not authorized to revoke this agent' });

    const revoked = await db.revokeAgent(agent.agentId, reason || 'No reason provided');
    console.log(`[VETRAN] REVOKED: ${agent.agentId} (${agent.name}) — ${revoked.revokeReason}`);

    res.json({
      success: true,
      message: `Agent "${agent.name}" has been revoked and is no longer cleared to execute`,
      agentId: revoked.agentId, revokedAt: revoked.revokedAt, reason: revoked.revokeReason,
    });
  } catch (err) {
    console.error('[VETRAN] Revoke error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────────
async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await db.migrate();
    } catch (err) {
      console.error('[VETRAN] Migration failed:', err.message);
      process.exit(1);
    }
  } else {
    console.warn('[VETRAN] No DATABASE_URL — running without persistence');
  }

  app.listen(PORT, () => {
    console.log(`
  ██╗   ██╗███████╗████████╗██████╗  █████╗ ███╗   ██╗
  ██║   ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║
  ██║   ██║█████╗     ██║   ██████╔╝███████║██╔██╗ ██║
  ╚██╗ ██╔╝██╔══╝     ██║   ██╔══██╗██╔══██║██║╚██╗██║
   ╚████╔╝ ███████╗   ██║   ██║  ██║██║  ██║██║ ╚████║
    ╚═══╝  ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝

  Trust infrastructure for AI agents.
  Port:      ${PORT}
  Database:  ${process.env.DATABASE_URL ? 'Postgres ✓' : 'Not connected'}
  RateLimit: ✓ enabled
    `);
  });
}

start();
module.exports = app;
