'use strict';

const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

// ─── Connection Pool ───────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[VETRAN] Unexpected DB pool error:', err.message);
});

// ─── Run schema migration ──────────────────────────────────────────────────────
async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('[VETRAN] Database schema applied ✓');
  } finally {
    client.release();
  }
}

// ─── Agent Queries ─────────────────────────────────────────────────────────────
async function createAgent(agent) {
  const sql = `
    INSERT INTO agents (
      agent_id, name, owner, model, description,
      capabilities, status, vetran_score, badge,
      registered_at, verification_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `;
  const vals = [
    agent.agentId, agent.name, agent.owner, agent.model,
    agent.description, JSON.stringify(agent.capabilities),
    agent.status, agent.vetranScore, agent.badge,
    agent.registeredAt, agent.verificationCount
  ];
  const { rows } = await pool.query(sql, vals);
  return rowToAgent(rows[0]);
}

async function getAgent(agentId) {
  const { rows } = await pool.query(
    'SELECT * FROM agents WHERE agent_id = $1',
    [agentId]
  );
  return rows[0] ? rowToAgent(rows[0]) : null;
}

async function incrementVerification(agentId, badge) {
  const { rows } = await pool.query(`
    UPDATE agents
    SET verification_count = verification_count + 1,
        last_verified_at   = NOW(),
        badge              = $2
    WHERE agent_id = $1
    RETURNING *
  `, [agentId, badge]);
  return rows[0] ? rowToAgent(rows[0]) : null;
}

async function revokeAgent(agentId, reason) {
  const { rows } = await pool.query(`
    UPDATE agents
    SET status        = 'REVOKED',
        revoked_at    = NOW(),
        revoke_reason = $2
    WHERE agent_id = $1
    RETURNING *
  `, [agentId, reason]);
  return rows[0] ? rowToAgent(rows[0]) : null;
}

async function getDelegationCount(agentId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM delegations WHERE parent_agent_id = $1',
    [agentId]
  );
  return parseInt(rows[0].count, 10);
}

// ─── Delegation Queries ────────────────────────────────────────────────────────
async function createDelegation(d) {
  const sql = `
    INSERT INTO delegations (
      delegation_id, parent_agent_id, child_agent_id,
      scoped_capabilities, delegation_token, expires_in
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
  `;
  const vals = [
    d.delegationId, d.parentAgentId, d.childAgentId,
    JSON.stringify(d.scopedCapabilities), d.token, d.expiresIn
  ];
  const { rows } = await pool.query(sql, vals);
  return rows[0];
}

// ─── Verification Log ──────────────────────────────────────────────────────────
async function logVerification(entry) {
  await pool.query(`
    INSERT INTO verification_log (
      agent_id, verified, cleared_to_execute,
      requested_caps, missing_caps, ip_address
    ) VALUES ($1,$2,$3,$4,$5,$6)
  `, [
    entry.agentId, entry.verified, entry.clearedToExecute,
    JSON.stringify(entry.requestedCaps || []),
    JSON.stringify(entry.missingCaps   || []),
    entry.ip || null
  ]);
}

// ─── Row → Agent Shape ─────────────────────────────────────────────────────────
function rowToAgent(row) {
  if (!row) return null;
  return {
    agentId:           row.agent_id,
    name:              row.name,
    owner:             row.owner,
    model:             row.model,
    description:       row.description,
    capabilities:      typeof row.capabilities === 'string'
                         ? JSON.parse(row.capabilities)
                         : row.capabilities || [],
    status:            row.status,
    vetranScore:       row.vetran_score,
    badge:             row.badge,
    registeredAt:      row.registered_at,
    lastVerifiedAt:    row.last_verified_at,
    verificationCount: row.verification_count,
    revokedAt:         row.revoked_at,
    revokeReason:      row.revoke_reason,
  };
}

// ─── Health check ──────────────────────────────────────────────────────────────
async function ping() {
  const { rows } = await pool.query('SELECT NOW() as time');
  return rows[0].time;
}

module.exports = {
  pool, migrate, ping,
  createAgent, getAgent, incrementVerification,
  revokeAgent, getDelegationCount,
  createDelegation, logVerification,
};
